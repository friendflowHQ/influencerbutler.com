/**
 * Summary: Types for the blog content autopilot. The queue lives as
 *   content/blog/_queue.json in the repo (committed via lib/github-content,
 *   same as posts) - see lib/blog-autogen/queue.ts for load/serialize.
 */

export type AutogenSettings = {
  /** Days before publishDate that generation runs (soft-review window). */
  leadDays: number;
  /** Max posts generated per cron run (keeps runs under maxDuration). */
  maxPerRun: number;
  /** Max posts published per calendar day across manifest + queue. */
  maxPerDay: number;
  /** Generation attempts before an item is marked failed. */
  maxAttempts: number;
  /** Send the admin summary email after each run that did work. */
  notify: boolean;
};

export type CampaignStatus = "active" | "completed" | "cancelled";

export type Campaign = {
  id: string;
  theme: string;
  notes?: string;
  cadenceDays: number;
  categoryMix: string[];
  status: CampaignStatus;
  createdAt: string;
  createdBy: string;
};

export type QueueItemStatus = "queued" | "generated" | "failed" | "cancelled";

export type QueueItem = {
  id: string;
  campaignId?: string;
  slug: string;
  title: string;
  summary: string;
  keywords: string;
  category: string;
  /** yyyy-mm-dd the post goes live (the manifest date). */
  publishDate: string;
  /** yyyy-mm-dd generation becomes due (publishDate - leadDays, or day-of). */
  generateOn: string;
  /** Extra topic guidance passed to the writer (one-offs mostly). */
  brief?: string;
  /** Up to 3 URLs fetched server-side as freshness context for timely posts. */
  researchUrls?: string[];
  status: QueueItemStatus;
  attempts: number;
  lastError: string | null;
  generatedAt: string | null;
  createdAt: string;
};

export type AutogenQueue = {
  version: number;
  settings: AutogenSettings;
  campaigns: Campaign[];
  items: QueueItem[];
};

/** What the OpenAI writer must return (parsed from its JSON response). */
export type WriterDraft = {
  title: string;
  summary: string;
  keywords: string;
  imageAlt: string;
  imagePrompt: string;
  body: string;
};

export type LintResult = {
  body: string;
  /** Problems that block the post (trigger one corrective re-prompt). */
  errors: string[];
  /** Non-blocking issues surfaced in the summary email. */
  warnings: string[];
};

export type GenerationResult = {
  ok: boolean;
  item: QueueItem;
  commitSha?: string;
  warnings?: string[];
  error?: string;
};
