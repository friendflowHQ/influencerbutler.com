// Builds the outgoing email for a marketing campaign from its stored fields.
//
// Campaigns are authored as plain text. When a campaign carries no media and no
// formatting markup it is sent as plain text exactly as before. When it carries
// inline images we also emit an HTML body: the text (escaped, newlines
// preserved) followed by each inline image referenced by a cid: matching its
// attachment content_id. Downloadable attachments are added regardless and need
// no HTML.
//
// A body that uses light markup (see hasCampaignMarkup) is rendered as readable,
// email-safe HTML instead (paragraph spacing, bold, headings, bullets, links,
// and a call-to-action button) with a clean plain-text alternative. Shipping
// HTML also lets Resend track opens and clicks.

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
 * True when the body opts in to formatted HTML: **bold**, a "# " heading line,
 * or two or more consecutive "- " bullet lines. Anything else stays a
 * plain-text campaign, so existing campaigns are unaffected. In particular a
 * bare URL on its own line and a single "- The team" sign-off do not count.
 */
export function hasCampaignMarkup(body: string): boolean {
  return /\*\*[^*\n]+\*\*/.test(body) || /^# /m.test(body) || /^- .*\r?\n- /m.test(body);
}

// "[label](https://...)" links and bare http(s) URLs. Runs on escaped text.
const LINK_RE =
  /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,!?:;)'"])/g;
const BUTTON_LINE_RE = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/;
const BRAND_ORANGE_TEXT = "#c2410c"; // brand-700: passes WCAG AA with white text

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(LINK_RE, (_m, label: string | undefined, mdUrl: string | undefined, bare: string | undefined) => {
      const url = mdUrl ?? bare ?? "";
      return `<a href="${url}" style="color:${BRAND_ORANGE_TEXT};">${label ?? url}</a>`;
    });
}

/** Renders a marked-up campaign body as email-safe HTML (inline styles only). */
export function renderCampaignHtml(body: string): string {
  const blocks = body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const parts = blocks.map((block) => {
    const button = BUTTON_LINE_RE.exec(block);
    if (button) {
      return (
        `<p style="margin:24px 0;text-align:center;"><a href="${escapeHtml(button[2])}" ` +
        `style="display:inline-block;background:${BRAND_ORANGE_TEXT};color:#ffffff;font-weight:600;` +
        `text-decoration:none;padding:14px 28px;border-radius:8px;">${escapeHtml(button[1])}</a></p>`
      );
    }
    if (/^# /.test(block) && !block.includes("\n")) {
      return `<h2 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${renderInline(block.slice(2))}</h2>`;
    }
    const lines = block.split("\n");
    if (lines.length > 1 && lines.every((l) => /^- /.test(l))) {
      const items = lines
        .map((l) => `<li style="margin:0 0 8px;">${renderInline(l.slice(2))}</li>`)
        .join("");
      return `<ul style="margin:0 0 16px;padding-left:22px;">${items}</ul>`;
    }
    return `<p style="margin:0 0 16px;">${lines.map(renderInline).join("<br>")}</p>`;
  });

  return (
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;` +
    `font-size:16px;line-height:1.6;color:#111827;max-width:560px;">${parts.join("\n")}</div>`
  );
}

/** Plain-text alternative for a marked-up body: markers removed, links spelled out. */
export function campaignPlainText(body: string): string {
  return body
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/^# /gm, "");
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
  const formatted = hasCampaignMarkup(body);
  const text = formatted ? campaignPlainText(body) : body;

  if (attachments.length === 0 && inlineImages.length === 0) {
    if (!formatted) return { text };
    return { text, html: renderCampaignHtml(body) };
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
  if (formatted) {
    html = renderCampaignHtml(body) + inlineHtmlParts.join("");
  } else if (inlineHtmlParts.length > 0) {
    html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#1f2937;">
        <pre style="white-space:pre-wrap;word-wrap:break-word;font-family:inherit;margin:0;">${escapeHtml(body)}</pre>
        ${inlineHtmlParts.join("")}
      </div>
    `.trim();
  }

  return { text, ...(html ? { html } : {}), attachments: resendAttachments };
}
