// Builds the outgoing email for a marketing campaign from its stored fields.
//
// Campaigns are authored as plain text. When a campaign carries no media it is
// sent as plain text exactly as before. When it carries inline images we also
// emit an HTML body: the text (escaped, newlines preserved) followed by each
// inline image referenced by a cid: matching its attachment content_id.
// Downloadable attachments are added regardless and need no HTML.

import type { NormalizedAttachment } from "@/lib/email-attachments";

export type ResendAttachment = {
  filename: string;
  content: string;
  content_type?: string;
  content_id?: string;
};

export type BuiltCampaignEmail = {
  text: string;
  html?: string;
  attachments?: ResendAttachment[];
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/**
 * Assemble text/html/attachments for one campaign recipient. `attachments`
 * download; `inlineImages` embed in the body. Pure and deterministic so the
 * test send and the bulk cron produce identical output.
 */
export function buildCampaignEmail(opts: {
  body: string;
  attachments?: NormalizedAttachment[];
  inlineImages?: NormalizedAttachment[];
}): BuiltCampaignEmail {
  const body = opts.body ?? "";
  const attachments = opts.attachments ?? [];
  const inlineImages = opts.inlineImages ?? [];

  if (attachments.length === 0 && inlineImages.length === 0) {
    return { text: body };
  }

  const resendAttachments: ResendAttachment[] = [];
  const inlineHtmlParts: string[] = [];
  inlineImages.forEach((img, i) => {
    const contentId = `inline-${i}@influencerbutler`;
    resendAttachments.push({
      filename: img.filename || `image-${i}.png`,
      content: img.content,
      content_id: contentId,
      ...(img.contentType ? { content_type: img.contentType } : {}),
    });
    inlineHtmlParts.push(
      `<div style="margin-top:12px;"><img src="cid:${contentId}" alt="${escapeHtml(img.filename || "image")}" style="max-width:100%;height:auto;border-radius:6px;" /></div>`,
    );
  });
  for (const file of attachments) {
    resendAttachments.push({
      filename: file.filename || "attachment",
      content: file.content,
      ...(file.contentType ? { content_type: file.contentType } : {}),
    });
  }

  // Only emit HTML when there is something to render inline. Download-only
  // campaigns stay text-first (attachments still ride along).
  let html: string | undefined;
  if (inlineHtmlParts.length > 0) {
    html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#1f2937;">
        <pre style="white-space:pre-wrap;word-wrap:break-word;font-family:inherit;margin:0;">${escapeHtml(body)}</pre>
        ${inlineHtmlParts.join("")}
      </div>
    `.trim();
  }

  return { text: body, ...(html ? { html } : {}), attachments: resendAttachments };
}
