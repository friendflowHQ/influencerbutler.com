import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  buildAffiliateResourcesEmail,
  affiliateShareLink,
  sendAffiliateResourcesEmail,
} from "@/lib/affiliate-resources-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-time admin broadcast: email every current affiliate a tour of their
 * dashboard plus the Content Planner and Competitor Playbook. New affiliates
 * already get this content in their approval email; this catches up the existing
 * roster. Gated behind affiliates.approve and audit-logged.
 *
 * POST ?dry=1  -> returns { total, lastSent } without sending (for the confirm).
 * POST         -> sends to all affiliates, records a last-sent marker, returns
 *                 { total, sent, failed }. Chosen send type is transactional
 *                 (reach everyone), matching the approval email.
 */

const CONFIG_KEY = "affiliate_resources_broadcast";

export async function POST(request: Request) {
  try {
    const actor = await requirePermission("affiliates.approve", request);
    if (!actor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const dry = new URL(request.url).searchParams.get("dry") === "1";
    const admin = createAdminClient();

    // All current affiliates with a usable email.
    const { data: profiles, error: profErr } = await admin
      .from("profiles")
      .select("id,email,affiliate_code")
      .eq("is_affiliate", true);
    if (profErr) {
      console.error("admin-broadcast-resources: profiles query failed", profErr);
      return NextResponse.json({ error: "Could not load affiliates" }, { status: 500 });
    }
    const affiliates = (profiles ?? []).filter(
      (p) => typeof p.email === "string" && p.email.includes("@"),
    );

    // Last-sent marker (shown in the confirm dialog).
    let lastSent: string | null = null;
    try {
      const { data: cfg } = await admin
        .from("app_config")
        .select("value")
        .eq("key", CONFIG_KEY)
        .maybeSingle();
      const v = cfg?.value as { sent_at?: string } | null;
      lastSent = v?.sent_at ?? null;
    } catch {
      lastSent = null;
    }

    if (dry) {
      return NextResponse.json({ total: affiliates.length, lastSent });
    }

    // Names for the greeting, from the applications table.
    const nameByUser = new Map<string, string | null>();
    try {
      const { data: apps } = await admin
        .from("affiliate_applications")
        .select("user_id,full_name");
      for (const a of apps ?? []) {
        const uid = typeof a.user_id === "string" ? a.user_id : null;
        if (uid) nameByUser.set(uid, typeof a.full_name === "string" ? a.full_name : null);
      }
    } catch (err) {
      console.warn("admin-broadcast-resources: names read skipped", err);
    }

    let sent = 0;
    let failed = 0;
    for (const a of affiliates) {
      const code = typeof a.affiliate_code === "string" ? a.affiliate_code : null;
      const { subject, text } = buildAffiliateResourcesEmail({
        name: nameByUser.get(a.id as string) ?? null,
        brandedCode: code,
        brandedShareLink: code ? affiliateShareLink(code) : null,
      });
      const ok = await sendAffiliateResourcesEmail(a.email as string, subject, text);
      if (ok) sent += 1;
      else failed += 1;
    }

    // Record the send so the UI can show "last sent" and guard double-sends.
    try {
      await admin.from("app_config").upsert(
        {
          key: CONFIG_KEY,
          value: { sent_at: new Date().toISOString(), total: affiliates.length, sent, failed },
          updated_at: new Date().toISOString(),
          updated_by: `admin:${actor.email}`,
        },
        { onConflict: "key" },
      );
    } catch (err) {
      console.warn("admin-broadcast-resources: marker write skipped", err);
    }

    await logAdminAction({
      actor,
      action: "affiliate.resources.broadcast",
      targetType: "affiliates",
      targetId: "all",
      details: { total: affiliates.length, sent, failed },
    });

    return NextResponse.json({ total: affiliates.length, sent, failed });
  } catch (err) {
    console.error("admin-broadcast-resources error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
