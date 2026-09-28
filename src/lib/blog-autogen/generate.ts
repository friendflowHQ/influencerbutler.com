/**
 * Summary: The autopilot's core: turn one queue item into a committed blog
 *   post. Used by both the daily cron and the admin "Generate now" route.
 *   Produces ONE atomic commit (manifest + MDX + hero PNG + queue update) so
 *   there is no partial state, guarded by expectedHeadSha with a
 *   reload-and-reapply loop: the generation window is 1-3 minutes, and a
 *   concurrent human admin save would otherwise be silently overwritten
 *   (whole-file manifest blobs merge without a git tree conflict).
 * Dependencies: api/admin/blog/shared (manifest + validation), lib/blog-hero,
 *   lib/github-content, lib/blog-markdown, ./context, ./writer, ./queue.
 */
import {
  CONTENT_DIR,
  MANIFEST_PATH,
  loadManifestFromGitHub,
  serializeManifest,
  validateBody,
  validateEntry,
} from "@/app/api/admin/blog/shared";
import type { BlogManifestEntry } from "@/lib/blog";
import { buildMdxFile } from "@/lib/blog-markdown";
import { generateHeroImage } from "@/lib/blog-hero";
import {
  ConflictError,
  commitFiles,
  getHead,
  type FileChange,
} from "@/lib/github-content";
import { assembleContext } from "./context";
import { QUEUE_PATH, loadQueue, serializeQueue } from "./queue";
import type { AutogenQueue, QueueItem } from "./types";
import { writePost } from "./writer";

export type GenerateOutcome = {
  commitSha: string;
  entry: BlogManifestEntry;
  warnings: string[];
  alreadyExisted?: boolean;
};

/**
 * Generate the post for `item` and commit everything atomically. The caller
 * passes its current view of the world; on success the SHARED manifest/queue
 * objects are mutated in place and the new head sha is returned so a cron loop
 * can serialize subsequent items on top.
 *
 * Throws on failure. The caller records attempts/lastError in the queue.
 */
export async function generateOne(
  item: QueueItem,
  world: { manifest: { version: number; posts: BlogManifestEntry[] }; queue: AutogenQueue; headSha: string },
): Promise<GenerateOutcome> {
  const { queue } = world;
  const campaign = item.campaignId
    ? queue.campaigns.find((c) => c.id === item.campaignId)
    : undefined;

  // Idempotency: if a post with this slug already exists (an earlier run's
  // commit landed but its notification failed, or a human wrote it), just
  // mark the item done.
  if (world.manifest.posts.some((p) => p.id === item.slug)) {
    item.status = "generated";
    item.generatedAt = new Date().toISOString();
    item.lastError = "Post already existed; marked generated";
    const { commitSha } = await commitFiles({
      message: `blog(autogen): mark ${item.slug} already generated [vercel skip]`,
      changes: [{ path: QUEUE_PATH, contentText: serializeQueue(queue) }],
      expectedHeadSha: world.headSha,
    });
    world.headSha = commitSha;
    return {
      commitSha,
      entry: world.manifest.posts.find((p) => p.id === item.slug)!,
      warnings: [],
      alreadyExisted: true,
    };
  }

  // 1. Grounding context + writing + lint (the slow part; no locks held).
  const context = await assembleContext(
    item,
    world.manifest.posts,
    campaign?.theme,
    campaign?.notes,
  );
  const written = await writePost(context.userMessage, context.allowedImagePaths);

  // 2. Validate through the same gates the admin editor uses.
  const words = written.lintedBody.split(/\s+/).filter(Boolean).length;
  const validated = validateEntry({
    id: item.slug,
    title: written.draft.title,
    category: item.category,
    summary: written.draft.summary,
    date: item.publishDate,
    readingTime: `${Math.max(3, Math.round(words / 200))} min read`,
    keywords: written.draft.keywords,
    imageAlt: written.draft.imageAlt,
    imagePrompt: written.draft.imagePrompt,
  });
  if ("error" in validated) throw new Error(`Entry validation failed: ${validated.error}`);
  const bodyValidated = validateBody(written.lintedBody);
  if ("error" in bodyValidated) throw new Error(`Body validation failed: ${bodyValidated.error}`);

  // 3. Hero image. A failure fails the whole item: the manifest bakes the
  //    image path, so committing without the PNG ships a broken hero.
  const heroB64 = await generateHeroImage(validated.entry.imagePrompt || written.draft.imagePrompt);

  // 4. Build + commit atomically, reloading and re-applying on conflicts.
  let attempt = 0;
  for (;;) {
    const entry: BlogManifestEntry = {
      ...validated.entry,
      author: "The Influencer Butler Team",
      image: `/assets/blog/${item.slug}.png`,
      order: world.manifest.posts.reduce((max, p) => Math.max(max, p.order || 0), 0) + 1,
    };
    world.manifest.posts.push(entry);
    item.status = "generated";
    item.generatedAt = new Date().toISOString();
    item.lastError = null;

    const mdx = buildMdxFile(
      {
        title: entry.title,
        summary: entry.summary,
        category: entry.category,
        date: entry.date,
        author: entry.author,
        readingTime: entry.readingTime,
        keywords: entry.keywords,
        image: entry.image,
        imageAlt: entry.imageAlt,
      },
      bodyValidated.body,
    );

    const changes: FileChange[] = [
      { path: MANIFEST_PATH, contentText: serializeManifest(world.manifest) },
      { path: `${CONTENT_DIR}/${item.slug}.en-US.mdx`, contentText: mdx },
      { path: `public/assets/blog/${item.slug}.png`, contentBase64: heroB64 },
      { path: QUEUE_PATH, contentText: serializeQueue(world.queue) },
    ];

    try {
      const { commitSha } = await commitFiles({
        message: `blog(autogen): create ${item.slug} (publishes ${item.publishDate})`,
        changes,
        expectedHeadSha: world.headSha,
      });
      world.headSha = commitSha;
      return { commitSha, entry, warnings: written.warnings };
    } catch (err) {
      // Roll back the optimistic in-memory mutations so a failed commit never
      // pollutes the shared state the caller reuses for the next item.
      world.manifest.posts = world.manifest.posts.filter((p) => p !== entry);
      item.status = "queued";
      item.generatedAt = null;
      if (!(err instanceof ConflictError) || attempt >= 2) throw err;
      attempt++;
      // Someone (human admin, another run) committed while we were writing.
      // Reload fresh state and re-apply our mutations; never regenerate the
      // text or image.
      const [freshManifest, freshQueue, freshHead] = await Promise.all([
        loadManifestFromGitHub(),
        loadQueue(),
        getHead(),
      ]);
      if (freshManifest.posts.some((p) => p.id === item.slug)) {
        // The race produced our post (double-generation): accept theirs.
        const freshItem = freshQueue.items.find((i) => i.id === item.id);
        if (freshItem) {
          freshItem.status = "generated";
          freshItem.generatedAt = new Date().toISOString();
        }
        const { commitSha } = await commitFiles({
          message: `blog(autogen): mark ${item.slug} generated after race [vercel skip]`,
          changes: [{ path: QUEUE_PATH, contentText: serializeQueue(freshQueue) }],
        });
        world.manifest = freshManifest;
        world.queue = freshQueue;
        world.headSha = commitSha;
        return {
          commitSha,
          entry: freshManifest.posts.find((p) => p.id === item.slug)!,
          warnings: written.warnings,
          alreadyExisted: true,
        };
      }
      // Re-point our world at the fresh state; the fresh queue must carry the
      // same item (matched by id) so we mutate the object we will serialize.
      const freshItem = freshQueue.items.find((i) => i.id === item.id);
      if (!freshItem) throw new Error("Queue item disappeared during conflict reload");
      world.manifest = freshManifest;
      world.queue = freshQueue;
      world.headSha = freshHead.commitSha;
      // Re-run the loop with the fresh item reference.
      Object.assign(freshItem, {
        status: "queued",
        generatedAt: null,
      });
      item = freshItem;
    }
  }
}
