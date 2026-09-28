import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import { openaiComplete } from "./integrations";
import type {
  CancelSocialPostResult,
  GenSocialCaptionResult,
  ListSocialPostsResult,
  ScheduleSocialPostResult,
  UploadSocialImageResult,
} from "../shared/messages";
import type { SocialCaptionInput, SocialPostInput } from "../shared/social";

// Background helpers for the "click an image, schedule a post" flow. The compose
// page and content-script triggers cannot hold the license key or hit our
// origin, so every authed call runs here, mirroring campaign-brief.ts.

async function licenseKey(): Promise<string | null> {
  const state = await getState();
  return state.auth.licenseKey;
}

export async function scheduleSocialPost(post: SocialPostInput): Promise<ScheduleSocialPostResult> {
  const key = await licenseKey();
  if (!key) return { ok: false, error: "Connect your license key first (open the extension popup)." };
  try {
    const res = await fetch(ENDPOINTS.socialPosts, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(post),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; id?: string; error?: string; migrationPending?: boolean }
      | null;
    if (data?.migrationPending) {
      return { ok: false, migrationPending: true, error: "Scheduling is not switched on yet. Try again shortly." };
    }
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error ?? "Could not schedule the post." };
    }
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, error: "Network error. Are you online?" };
  }
}

export async function listSocialPosts(status?: string, limit?: number): Promise<ListSocialPostsResult> {
  const key = await licenseKey();
  if (!key) return { ok: false, posts: [], error: "Connect your license key first." };
  try {
    const url = new URL(ENDPOINTS.socialPosts);
    if (status) url.searchParams.set("status", status);
    if (limit) url.searchParams.set("limit", String(limit));
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = (await res.json().catch(() => null)) as ListSocialPostsResult | null;
    if (data?.migrationPending) return { ok: true, posts: [], migrationPending: true };
    if (!res.ok || !data?.ok) return { ok: false, posts: [], error: data?.error ?? "Could not load posts." };
    return { ok: true, posts: data.posts ?? [] };
  } catch {
    return { ok: false, posts: [], error: "Network error loading posts." };
  }
}

export async function cancelSocialPost(id: string): Promise<CancelSocialPostResult> {
  const key = await licenseKey();
  if (!key) return { ok: false, error: "Connect your license key first." };
  try {
    const res = await fetch(`${ENDPOINTS.socialPosts}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ status: "canceled" }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error ?? "Could not cancel the post." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error canceling the post." };
  }
}

// Build the one-shot caption prompt for the BYO-OpenAI path (the free path uses
// the server route, which owns its own prompt). Kept short and grounded so it
// never invents prices or claims. Never uses em dashes (repo rule).
function buildCaptionPrompt(input: SocialCaptionInput): string {
  const topic = (input.topic || input.productTitle || "").trim();
  const lines = [
    "Write one short, natural social media caption for an Amazon influencer about to post.",
    `Post is about: ${topic || "the attached image (topic not specified)"}.`,
  ];
  if (input.pageUrl) lines.push(`Found on page: ${input.pageUrl}.`);
  if (input.tone) lines.push(`Preferred tone: ${input.tone}.`);
  lines.push(
    "Keep it a sentence or two, warm and human, a tasteful emoji or two is fine, and end with 2-4 relevant hashtags.",
    "Do not invent prices, discounts, or claims you were not given. Do not use em dashes.",
    "Reply with the caption text only, no preamble.",
  );
  return lines.join(" ");
}

export async function generateSocialCaption(input: SocialCaptionInput): Promise<GenSocialCaptionResult> {
  // The creator's own OpenAI key path: draft locally with their key, their cost.
  if (input.engine === "openai") {
    const res = await openaiComplete(buildCaptionPrompt(input));
    if (!res.ok || !res.text) {
      return { ok: false, error: res.error ?? "Connect your OpenAI key in Settings, or use the free engine." };
    }
    return { ok: true, caption: res.text.trim(), alts: [] };
  }

  // The free ("Influencer Butler AI") path: the server route drafts it.
  const key = await licenseKey();
  if (!key) return { ok: false, error: "Connect your license key first." };
  try {
    const res = await fetch(ENDPOINTS.socialCaption, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        topic: input.topic ?? null,
        productTitle: input.productTitle ?? null,
        imageUrl: input.imageUrl ?? null,
        pageUrl: input.pageUrl ?? null,
        tone: input.tone ?? null,
        locale: input.locale ?? null,
      }),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; caption?: string; alts?: string[]; error?: string }
      | null;
    if (!res.ok || !data?.ok || !data.caption) {
      return { ok: false, error: data?.error ?? "Could not draft a caption right now." };
    }
    return { ok: true, caption: data.caption, alts: data.alts ?? [] };
  } catch {
    return { ok: false, error: "Network error drafting the caption." };
  }
}

// Convert a data: URL to a Blob for multipart upload (no fetch(dataUrl), which
// some CSP contexts block).
function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const raw = match[3] ?? "";
  let bytes: Uint8Array;
  try {
    if (isBase64) {
      const binary = atob(raw);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(raw));
    }
  } catch {
    return null;
  }
  const ext = contentType.split("/")[1]?.split("+")[0] || "jpg";
  return { blob: new Blob([bytes as unknown as BlobPart], { type: contentType }), ext };
}

export async function uploadSocialImage(dataUrl: string): Promise<UploadSocialImageResult> {
  const key = await licenseKey();
  if (!key) return { ok: false, error: "Connect your license key first." };
  const parsed = dataUrlToBlob(dataUrl);
  if (!parsed) return { ok: false, error: "That image could not be read." };
  try {
    const form = new FormData();
    form.append("file", parsed.blob, `upload.${parsed.ext}`);
    const res = await fetch(ENDPOINTS.socialPostsUpload, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; url?: string; path?: string; error?: string }
      | null;
    if (!res.ok || !data?.ok || !data.url) {
      return { ok: false, error: data?.error ?? "Could not upload that image." };
    }
    return { ok: true, url: data.url, path: data.path };
  } catch {
    return { ok: false, error: "Network error uploading the image." };
  }
}
