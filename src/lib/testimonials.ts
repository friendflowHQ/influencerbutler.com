// Testimonial collection & management: shared data layer.
//
// Mirrors src/lib/recent-activity.ts. All access is server-side with the
// service-role key (the table is RLS-locked). The public marketing feed exposes
// only non-identifying fields (first name + role, never email). Writes from the
// customer submit route are best-effort in spirit but DO surface success/failure
// so the form can tell the user whether their review went live or is pending.
//
// If migration 20260703_testimonials.sql has not been applied to prod yet, reads
// return empty and the submit insert fails loudly (the route reports an error).

import { createServerClient } from "@supabase/ssr";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type TestimonialStatus = "pending" | "approved" | "rejected" | "hidden";

/** Public-safe shape returned to the marketing-site feed. */
export type PublicTestimonial = {
  id: string;
  name: string | null;
  role: string | null;
  rating: number;
  body: string;
  photoUrl: string | null;
  teamResponse: string | null;
  createdAt: string;
};

/** Full row shape used by the admin moderation dashboard. */
export type AdminTestimonial = {
  id: string;
  userId: string | null;
  email: string | null;
  authorName: string | null;
  authorRole: string | null;
  planName: string | null;
  rating: number;
  body: string;
  photoUrl: string | null;
  avatarUrl: string | null;
  consent: boolean;
  status: TestimonialStatus;
  autoApproved: boolean;
  featured: boolean;
  teamResponse: string | null;
  respondedAt: string | null;
  respondedBy: string | null;
  source: string | null;
  createdAt: string;
  approvedAt: string | null;
};

export type TestimonialsConfig = {
  enabled: boolean;
  autoApprove: boolean;
  autoApproveMinRating: number;
  publicMaxCount: number;
};

export const DEFAULT_TESTIMONIALS_CONFIG: TestimonialsConfig = {
  enabled: true,
  autoApprove: true,
  autoApproveMinRating: 4,
  publicMaxCount: 12,
};

const CONFIG_KEY = "testimonials";

export type SubmitTestimonialInput = {
  userId: string | null;
  email: string | null;
  authorName: string;
  authorRole: string | null;
  planName: string | null;
  rating: number;
  body: string;
  photoUrl: string | null;
  avatarUrl: string | null;
  consent: boolean;
  source: string;
};

export type SubmitTestimonialResult =
  | { ok: true; id: string; status: TestimonialStatus }
  | { ok: false; error: string };

// --------------------------------------------------------------------------
// Service-role client (hand-rolled minimal surface, matching recent-activity.ts)
// --------------------------------------------------------------------------

type Filter = {
  eq: (col: string, val: unknown) => Filter;
  in: (col: string, vals: unknown[]) => Filter;
  order: (col: string, opts: { ascending: boolean }) => Filter;
  limit: (n: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
};
type ServiceDb = {
  from: (table: string) => {
    insert: (
      rows: Record<string, unknown>,
    ) => {
      select: (cols: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    upsert: (
      row: Record<string, unknown>,
      opts?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => Promise<{ error: unknown }>;
    };
    select: (cols: string) => Filter;
  };
};

function serviceDb(): ServiceDb | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://khutiiojhafblabtixpp.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createServerClient(url, key, {
    cookies: { getAll() { return []; }, setAll() { /* stateless */ } },
  }) as unknown as ServiceDb;
}

/** Returns the first word of a full name, for public display. */
export function firstNameFrom(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const first = fullName.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first.slice(0, 40) : null;
}

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------

function coerceConfig(raw: unknown): TestimonialsConfig {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const minRating = Number(v.auto_approve_min_rating);
  const maxCount = Number(v.public_max_count);
  return {
    enabled: v.enabled !== false,
    autoApprove: v.auto_approve !== false,
    autoApproveMinRating:
      Number.isFinite(minRating) && minRating >= 1 && minRating <= 5
        ? Math.round(minRating)
        : DEFAULT_TESTIMONIALS_CONFIG.autoApproveMinRating,
    publicMaxCount:
      Number.isFinite(maxCount) && maxCount > 0
        ? Math.min(Math.round(maxCount), 50)
        : DEFAULT_TESTIMONIALS_CONFIG.publicMaxCount,
  };
}

export async function readTestimonialsConfig(): Promise<TestimonialsConfig> {
  try {
    const db = serviceDb();
    if (!db) return DEFAULT_TESTIMONIALS_CONFIG;
    const { data, error } = await db
      .from("app_config")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle();
    if (error || !data) return DEFAULT_TESTIMONIALS_CONFIG;
    return coerceConfig(data.value);
  } catch {
    return DEFAULT_TESTIMONIALS_CONFIG;
  }
}

export async function writeTestimonialsConfig(
  next: TestimonialsConfig,
  updatedBy: string | null,
): Promise<boolean> {
  const db = serviceDb();
  if (!db) return false;
  const { error } = await db.from("app_config").upsert(
    {
      key: CONFIG_KEY,
      value: {
        enabled: next.enabled,
        auto_approve: next.autoApprove,
        auto_approve_min_rating: next.autoApproveMinRating,
        public_max_count: next.publicMaxCount,
      },
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: "key" },
  );
  if (error) {
    console.error("writeTestimonialsConfig: upsert failed", error);
    return false;
  }
  return true;
}

// --------------------------------------------------------------------------
// Submit (customer-facing write)
// --------------------------------------------------------------------------

/**
 * Inserts a customer testimonial. Status is derived from the moderation config:
 * a rating at or above the auto-approve threshold (with auto-approve enabled)
 * publishes instantly; anything lower is held as 'pending' for the team to
 * review and respond to. Returns the new id + resolved status, or an error.
 */
export async function submitTestimonial(
  input: SubmitTestimonialInput,
): Promise<SubmitTestimonialResult> {
  const db = serviceDb();
  if (!db) return { ok: false, error: "Server misconfigured" };

  const config = await readTestimonialsConfig();
  const autoApprove = config.autoApprove && input.rating >= config.autoApproveMinRating;
  const nowIso = new Date().toISOString();
  const status: TestimonialStatus = autoApprove ? "approved" : "pending";

  try {
    const { data, error } = await db
      .from("testimonials")
      .insert({
        user_id: input.userId,
        email: input.email,
        author_name: input.authorName,
        author_role: input.authorRole,
        plan_name: input.planName,
        rating: input.rating,
        body: input.body,
        photo_url: input.photoUrl,
        avatar_url: input.avatarUrl,
        consent: input.consent,
        status,
        auto_approved: autoApprove,
        source: input.source,
        approved_at: autoApprove ? nowIso : null,
      })
      .select("id")
      .maybeSingle();

    if (error || !data?.id) {
      console.error("submitTestimonial: insert failed", error);
      return { ok: false, error: "Could not save testimonial" };
    }
    return { ok: true, id: String(data.id), status };
  } catch (err) {
    console.error("submitTestimonial threw", err);
    return { ok: false, error: "Could not save testimonial" };
  }
}

// --------------------------------------------------------------------------
// Reads
// --------------------------------------------------------------------------

function toPublic(row: Record<string, unknown>): PublicTestimonial {
  return {
    id: String(row.id),
    name: firstNameFrom((row.author_name as string | null) ?? null),
    role: (row.author_role as string | null) ?? null,
    rating: Number(row.rating) || 5,
    body: (row.body as string) ?? "",
    photoUrl: (row.photo_url as string | null) ?? (row.avatar_url as string | null) ?? null,
    teamResponse: (row.team_response as string | null) ?? null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

/** Approved, consented testimonials for the marketing feed: featured first. */
export async function getPublicTestimonials(): Promise<{
  enabled: boolean;
  testimonials: PublicTestimonial[];
}> {
  const config = await readTestimonialsConfig();
  if (!config.enabled) return { enabled: false, testimonials: [] };

  const db = serviceDb();
  if (!db) return { enabled: true, testimonials: [] };

  try {
    const { data, error } = await db
      .from("testimonials")
      .select("id,author_name,author_role,rating,body,photo_url,avatar_url,team_response,created_at,featured,approved_at")
      .eq("status", "approved")
      .eq("consent", true)
      // featured first, then most recently approved.
      .order("featured", { ascending: false })
      .order("approved_at", { ascending: false })
      .limit(config.publicMaxCount);
    if (error || !data) return { enabled: true, testimonials: [] };
    return { enabled: true, testimonials: data.map(toPublic) };
  } catch {
    return { enabled: true, testimonials: [] };
  }
}

function toAdmin(row: Record<string, unknown>): AdminTestimonial {
  return {
    id: String(row.id),
    userId: (row.user_id as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    authorName: (row.author_name as string | null) ?? null,
    authorRole: (row.author_role as string | null) ?? null,
    planName: (row.plan_name as string | null) ?? null,
    rating: Number(row.rating) || 0,
    body: (row.body as string) ?? "",
    photoUrl: (row.photo_url as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    consent: row.consent !== false,
    status: ((row.status as string) ?? "pending") as TestimonialStatus,
    autoApproved: row.auto_approved === true,
    featured: row.featured === true,
    teamResponse: (row.team_response as string | null) ?? null,
    respondedAt: (row.responded_at as string | null) ?? null,
    respondedBy: (row.responded_by as string | null) ?? null,
    source: (row.source as string | null) ?? null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    approvedAt: (row.approved_at as string | null) ?? null,
  };
}

/** All testimonials (optionally filtered by status) for the admin queue. */
export async function listAdminTestimonials(
  status: TestimonialStatus | "all" = "all",
  limit = 100,
): Promise<AdminTestimonial[]> {
  const db = serviceDb();
  if (!db) return [];
  try {
    let query = db
      .from("testimonials")
      .select(
        "id,user_id,email,author_name,author_role,plan_name,rating,body,photo_url,avatar_url,consent,status,auto_approved,featured,team_response,responded_at,responded_by,source,created_at,approved_at",
      );
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map(toAdmin);
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------------
// Admin mutations
// --------------------------------------------------------------------------

export async function setTestimonialStatus(
  id: string,
  status: TestimonialStatus,
): Promise<boolean> {
  const db = serviceDb();
  if (!db) return false;
  const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  // Stamp approved_at the first time it goes live (idempotent on re-approve).
  if (status === "approved") payload.approved_at = new Date().toISOString();
  const { error } = await db.from("testimonials").update(payload).eq("id", id);
  if (error) {
    console.error("setTestimonialStatus: update failed", error);
    return false;
  }
  return true;
}

export async function setTestimonialResponse(
  id: string,
  response: string | null,
  respondedBy: string | null,
): Promise<boolean> {
  const db = serviceDb();
  if (!db) return false;
  const trimmed = response?.trim() || null;
  const { error } = await db
    .from("testimonials")
    .update({
      team_response: trimmed,
      responded_at: trimmed ? new Date().toISOString() : null,
      responded_by: trimmed ? respondedBy : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error("setTestimonialResponse: update failed", error);
    return false;
  }
  return true;
}

export async function setTestimonialFeatured(id: string, featured: boolean): Promise<boolean> {
  const db = serviceDb();
  if (!db) return false;
  const { error } = await db
    .from("testimonials")
    .update({ featured, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("setTestimonialFeatured: update failed", error);
    return false;
  }
  return true;
}

/** Edits the customer-visible text fields (light copy-edit before publishing). */
export async function updateTestimonial(
  id: string,
  fields: { authorName?: string; authorRole?: string | null; body?: string },
): Promise<boolean> {
  const db = serviceDb();
  if (!db) return false;
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof fields.authorName === "string") payload.author_name = fields.authorName.trim();
  if (fields.authorRole !== undefined)
    payload.author_role = fields.authorRole?.trim() || null;
  if (typeof fields.body === "string") payload.body = fields.body.trim();
  const { error } = await db.from("testimonials").update(payload).eq("id", id);
  if (error) {
    console.error("updateTestimonial: update failed", error);
    return false;
  }
  return true;
}
