/**
 * POST /api/admin/events/update
 * Body: { id, title, description?, dateOptions: [{startsAt, endsAt}], timezone?,
 *         recordEnabled?, joinUrl?, isPrivate?, banner?: {...} }
 * Edits an existing event's details + banner config. Always targets exactly one
 * occurrence row (only dateOptions[0] is used) - sibling time options on a
 * multi-date event, if any, are untouched. Does not re-provision the Meet link
 * or Recall bot (those are set at create time); a manual joinUrl edit is
 * honored. Gated by events.manage; audit-logged.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin, getEvent } from "@/lib/events";
import {
  parseInvitePlan,
  parseReplayPlan,
  scheduleEventInvite,
  saveReplayPlan,
} from "@/lib/event-email-lifecycle";
import { parseEventInput } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = ((raw as { id?: string })?.id || "").trim();
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const parsed = parseEventInput(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;
  // Editing always targets exactly one occurrence row - sibling time options
  // (if any) are untouched, so only the first dateOptions entry is used here.
  const [{ startMs, endMs }] = input.dateOptions;

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const patch: Record<string, unknown> = {
    title: input.title,
    description: input.description,
    starts_at: new Date(startMs).toISOString(),
    ends_at: new Date(endMs).toISOString(),
    timezone: input.timezone,
    record_enabled: input.recordEnabled,
    is_private: input.isPrivate,
    banner_enabled: input.banner.enabled,
    banner_text: input.banner.text,
    banner_cta_label: input.banner.ctaLabel,
    banner_starts_at: input.banner.startsAt,
    banner_ends_at: input.banner.endsAt,
    banner_surfaces: input.banner.surfaces,
  };
  // Only overwrite the join link when the admin supplied one, so we do not wipe
  // an auto-created Meet link on an edit that left the field blank.
  if (input.joinUrl) {
    patch.join_url = input.joinUrl;
    patch.meeting_provider = "manual";
  }

  const { error } = await admin.from("events").update(patch).eq("id", id);
  if (error) {
    console.error("[admin/events/update] update", error.message);
    return NextResponse.json({ error: "Could not update event." }, { status: 500 });
  }

  // Email lifecycle (best-effort): persist the replay plan, and schedule an
  // invite campaign if one is requested and this event does not already have
  // one (so re-saving an event never creates duplicate invites).
  try {
    const replayPlan = parseReplayPlan((raw as { replay?: unknown }).replay);
    if (replayPlan) await saveReplayPlan(admin, id, replayPlan);

    const invitePlan = parseInvitePlan((raw as { invite?: unknown }).invite);
    if (invitePlan) {
      const existing = await getEvent(admin, id);
      if (!existing?.inviteCampaignId) {
        await scheduleEventInvite(admin, {
          event: {
            id,
            title: input.title,
            description: input.description,
            startMs,
            endMs,
            timezone: input.timezone,
          },
          plan: invitePlan,
          createdBy: actor.email,
        });
      }
    }
  } catch (e) {
    console.error("[admin/events/update] lifecycle", e);
  }

  await logAdminAction({
    actor,
    action: "event.update",
    targetType: "event",
    targetId: id,
    details: { title: input.title, bannerEnabled: input.banner.enabled },
  });

  return NextResponse.json({ ok: true });
}
