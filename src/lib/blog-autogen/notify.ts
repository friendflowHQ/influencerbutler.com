/**
 * Summary: Admin summary email after an autopilot run. One email per run that
 *   did work (generated or failed items), listing each post with its status,
 *   commit, warnings, and editor link. Uses the transactional sendEmail
 *   chokepoint; recipients come from ADMIN_EMAILS (digest-email pattern).
 * Dependencies: lib/email-send.
 */
import { sendEmail } from "@/lib/email-send";
import type { GenerationResult } from "./types";

const FROM = "Influencer Butler <hello@influencerbutler.com>";
const SITE = "https://influencerbutler.com";

function recipients(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

export async function sendAutogenSummary(results: GenerationResult[]): Promise<void> {
  const to = recipients();
  if (!to.length || !results.length) return;

  const generated = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const subject = `Blog autopilot: ${generated.length} generated${failed.length ? `, ${failed.length} failed` : ""}`;

  const lines: string[] = [];
  const htmlRows: string[] = [];
  for (const result of results) {
    const item = result.item;
    const editUrl = `${SITE}/dashboard/admin/blog/edit/${item.slug}`;
    if (result.ok) {
      lines.push(
        `GENERATED: ${item.title} (publishes ${item.publishDate})`,
        `  Edit: ${editUrl}`,
        ...(result.warnings?.length ? [`  Warnings: ${result.warnings.join("; ")}`] : []),
        ...(result.commitSha ? [`  Commit: ${result.commitSha.slice(0, 7)}`] : []),
      );
      htmlRows.push(
        `<li><strong>${item.title}</strong> - publishes ${item.publishDate}. <a href="${editUrl}">Review or edit</a>.${
          result.warnings?.length
            ? `<br/><em>Warnings: ${result.warnings.join("; ")}</em>`
            : ""
        }</li>`,
      );
    } else {
      lines.push(
        `FAILED: ${item.title} (attempt ${item.attempts})`,
        `  Error: ${result.error}`,
      );
      htmlRows.push(
        `<li><strong>${item.title}</strong> - FAILED (attempt ${item.attempts}): ${result.error}</li>`,
      );
    }
  }
  lines.push("", `Manage the queue: ${SITE}/dashboard/admin/blog/autopilot`);

  const html = `<p>Blog autopilot run summary:</p><ul>${htmlRows.join("")}</ul><p><a href="${SITE}/dashboard/admin/blog/autopilot">Manage the queue</a></p>`;

  for (const recipient of to) {
    await sendEmail({
      from: FROM,
      to: recipient,
      subject,
      text: lines.join("\n"),
      html,
      category: "blog_autogen",
      funnel: "transactional",
    });
  }
}
