/**
 * Monthly growth checklist API.
 *
 * GET    /api/admin/growth/checklist?month=YYYY-MM
 *   Seeds the month from the curated idea library once (current month only)
 *   and returns the items plus the month's celebration marker.
 * POST   { month, title, description?, category? }   add a custom item
 * PATCH  { id, action: "toggle", done } | { id, action: "edit", title?, description?, category? }
 *        | { action: "celebrated", month }           month-complete confetti marker
 * DELETE { id }
 *
 * Depends on the 20260705_growth_dashboard migration; responses carry
 * migrationPending: true until it is applied in prod.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { monthKey } from "@/lib/growth-metrics";
import {
  readMonthMarker,
  writeMonthMarker,
  isMissingTable,
  type GoalsClient,
} from "@/lib/growth-goals";
import { seedChecklist, type IdeaCategory } from "@/lib/growth-ideas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES: IdeaCategory[] = ["content", "affiliates", "conversion", "retention", "community"];

type DbError = { message?: string; code?: string } | null;

type ListClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: Record<string, unknown>[] | null; error: DbError }>;
      };
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: DbError }>;
    update: (values: Record<string, unknown>) => {
      eq: (col: string, value: string) => Promise<{ error: DbError }>;
    };
    delete: () => {
      eq: (col: string, value: string) => Promise<{ error: DbError }>;
    };
  };
};

type ChecklistItem = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  source: string;
  sort: number;
  doneAt: string | null;
};

function toItem(raw: Record<string, unknown>): ChecklistItem | null {
  if (typeof raw.id !== "string" || typeof raw.title !== "string") return null;
  return {
    id: raw.id,
    title: raw.title,
    description: typeof raw.description === "string" ? raw.description : null,
    category: typeof raw.category === "string" ? raw.category : "content",
    source: typeof raw.source === "string" ? raw.source : "library",
    sort: typeof raw.sort === "number" ? raw.sort : 0,
    doneAt: typeof raw.done_at === "string" ? raw.done_at : null,
  };
}

async function listItems(
  db: ListClient,
  month: string,
): Promise<{ items: ChecklistItem[] | null; migrationPending: boolean }> {
  const { data, error } = await db
    .from("growth_checklist_items")
    .select("id,title,description,category,source,sort,done_at")
    .eq("month", month)
    .order("sort", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return { items: null, migrationPending: true };
    console.error("growth checklist: list failed", error);
    return { items: null, migrationPending: false };
  }
  const items: ChecklistItem[] = [];
  for (const raw of data ?? []) {
    const item = toItem(raw);
    if (item) items.push(item);
  }
  return { items, migrationPending: false };
}

function monthParam(value: string | null): string | null {
  if (value === null) return monthKey(new Date());
  return /^\d{4}-\d{2}$/.test(value) ? value : null;
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const db = supabase as unknown as ListClient;
  const markerDb = supabase as unknown as GoalsClient;

  const month = monthParam(new URL(request.url).searchParams.get("month"));
  if (!month) return NextResponse.json({ error: "Invalid month" }, { status: 400 });

  let migrationPending = false;
  if (month === monthKey(new Date())) {
    const seeded = await seedChecklist(markerDb, month);
    migrationPending = migrationPending || seeded.migrationPending;
  }

  const listed = await listItems(db, month);
  migrationPending = migrationPending || listed.migrationPending;
  const marker = await readMonthMarker(markerDb, month);

  return NextResponse.json({
    admin: { email: actor.email },
    month,
    migrationPending,
    items: listed.items ?? [],
    celebratedAt: marker.checklist_celebrated_at ?? null,
  });
}

export async function POST(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const db = supabase as unknown as ListClient;
  const markerDb = supabase as unknown as GoalsClient;

  let body: { month?: unknown; title?: unknown; description?: unknown; category?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const month = monthParam(typeof body.month === "string" ? body.month : null);
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!month || title.length === 0) {
    return NextResponse.json({ error: "month and title are required" }, { status: 400 });
  }
  const description =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description.trim().slice(0, 600)
      : null;
  const category = CATEGORIES.includes(body.category as IdeaCategory)
    ? (body.category as IdeaCategory)
    : "content";

  const listed = await listItems(db, month);
  if (listed.migrationPending) {
    return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
  }
  const maxSort = Math.max(0, ...(listed.items ?? []).map((i) => i.sort));

  const { error } = await db.from("growth_checklist_items").insert({
    month,
    title,
    description,
    category,
    source: "custom",
    sort: maxSort + 10,
  });
  if (error) {
    console.error("growth checklist: insert failed", error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  // A new open item reopens the month.
  const marker = await readMonthMarker(markerDb, month);
  if (marker.checklist_celebrated_at) {
    await writeMonthMarker(markerDb, month, { checklist_celebrated_at: undefined });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const db = supabase as unknown as ListClient;
  const markerDb = supabase as unknown as GoalsClient;

  let body: {
    id?: unknown;
    action?: unknown;
    done?: unknown;
    title?: unknown;
    description?: unknown;
    category?: unknown;
    month?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : null;

  if (action === "celebrated") {
    const month = monthParam(typeof body.month === "string" ? body.month : null);
    if (!month) return NextResponse.json({ error: "Invalid month" }, { status: 400 });
    const listed = await listItems(db, month);
    if (listed.migrationPending) {
      return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
    }
    const items = listed.items ?? [];
    const allDone = items.length > 0 && items.every((i) => i.doneAt !== null);
    if (!allDone) {
      return NextResponse.json({ error: "Checklist is not complete" }, { status: 400 });
    }
    await writeMonthMarker(markerDb, month, {
      checklist_celebrated_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  }

  const id = typeof body.id === "string" ? body.id : null;
  if (!id || !action) {
    return NextResponse.json({ error: "id and action are required" }, { status: 400 });
  }

  let values: Record<string, unknown> | null = null;
  if (action === "toggle") {
    if (typeof body.done !== "boolean") {
      return NextResponse.json({ error: "done (boolean) is required" }, { status: 400 });
    }
    values = { done_at: body.done ? new Date().toISOString() : null };
  } else if (action === "edit") {
    values = {};
    if (typeof body.title === "string" && body.title.trim().length > 0) {
      values.title = body.title.trim().slice(0, 200);
    }
    if (typeof body.description === "string") {
      const desc = body.description.trim().slice(0, 600);
      values.description = desc.length > 0 ? desc : null;
    }
    if (CATEGORIES.includes(body.category as IdeaCategory)) {
      values.category = body.category;
    }
    if (Object.keys(values).length === 0) {
      return NextResponse.json({ error: "Nothing to edit" }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { error } = await db.from("growth_checklist_items").update(values).eq("id", id);
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
    }
    console.error("growth checklist: update failed", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient() as unknown as ListClient | null;
  if (!supabase) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: { id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("growth_checklist_items").delete().eq("id", id);
  if (error) {
    console.error("growth checklist: delete failed", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
