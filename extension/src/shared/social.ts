// Shared types for the "click an image, schedule a post" flow. Used by the
// compose page, the background scheduler helper, and the content-script triggers.
// The shapes mirror the backend (src/lib/social-posts.ts) and the desktop Social
// Posting Butler library so a scheduled post maps straight across all three.

export type SocialImageSource = "url" | "upload" | "none";
export type SocialMode = "once" | "evergreen";
export type SocialStatus = "pending" | "claimed" | "posted" | "canceled" | "failed";

// Evergreen cadence: either "every N hours" or "these weekdays at HH:MM".
export type SocialSchedule =
  | { type: "interval"; everyHours: number; anchorAt?: string }
  | { type: "weekly"; days: number[]; hour: number; minute: number };

// Which engine drafts the caption. "free" uses the first-party Influencer Butler
// AI endpoint (no key); "openai" uses the creator's own connected OpenAI key.
export type CaptionEngine = "free" | "openai";

// The payload the compose page sends to schedule a post (background -> backend).
export type SocialPostInput = {
  title?: string | null;
  caption?: string | null;
  link?: string | null;
  link_in_first_comment?: boolean;
  first_comment_text?: string | null;
  image_source: SocialImageSource;
  image_url?: string | null;
  image_path?: string | null;
  destinations?: string[] | null;
  mode: SocialMode;
  scheduled_at?: string | null;
  schedule?: SocialSchedule | null;
  page_url?: string | null;
};

// A scheduled post as read back from the backend (the mini calendar / upcoming).
export type SocialPostRecord = SocialPostInput & {
  id: string;
  status: SocialStatus;
  claimed_at: string | null;
  posted_at: string | null;
  error: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

// Context captured from the page the creator triggered the schedule from.
export type SocialComposeContext = {
  imageUrl: string | null;
  pageUrl: string | null;
  title: string | null;
};

// Input for a caption draft request.
export type SocialCaptionInput = {
  engine: CaptionEngine;
  topic?: string | null;
  productTitle?: string | null;
  imageUrl?: string | null;
  pageUrl?: string | null;
  tone?: string | null;
  locale?: string | null;
};
