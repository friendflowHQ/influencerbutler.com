/**
 * Client-side types for the autopilot dashboard, mirroring
 * src/lib/blog-autogen/types.ts (which is server-only via github-content).
 */

export type AutopilotSettings = {
  leadDays: number;
  maxPerRun: number;
  maxPerDay: number;
  maxAttempts: number;
  notify: boolean;
};

export type AutopilotCampaign = {
  id: string;
  theme: string;
  notes?: string;
  cadenceDays: number;
  categoryMix: string[];
  status: "active" | "completed" | "cancelled";
  createdAt: string;
  createdBy: string;
};

export type AutopilotItem = {
  id: string;
  campaignId?: string;
  slug: string;
  title: string;
  summary: string;
  keywords: string;
  category: string;
  publishDate: string;
  generateOn: string;
  brief?: string;
  researchUrls?: string[];
  status: "queued" | "generated" | "failed" | "cancelled";
  attempts: number;
  lastError: string | null;
  generatedAt: string | null;
  createdAt: string;
  due?: boolean;
};

export type AutopilotData = {
  campaigns: AutopilotCampaign[];
  items: AutopilotItem[];
  settings: AutopilotSettings;
  headSha: string;
  today: string;
  writerModel: string;
  disabled: boolean;
};

export type ProposedTopic = {
  slug: string;
  title: string;
  summary: string;
  keywords: string;
  category: string;
  publishDate: string;
  generateOn: string;
};

export const AUTOPILOT_CATEGORIES = ["Growth", "Amazon", "Deals", "Instagram", "Benable"] as const;

export const ITEM_BADGE: Record<string, string> = {
  queued: "bg-slate-100 text-slate-600",
  due: "bg-amber-50 text-amber-700",
  generated: "bg-emerald-50 text-emerald-700",
  failed: "bg-rose-50 text-rose-700",
  cancelled: "bg-slate-100 text-slate-400 line-through",
};
