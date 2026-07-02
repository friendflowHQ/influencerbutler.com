/**
 * GET  /api/dashboard/getting-started
 *   -> { show, steps: { subscribe, download, activate, profile, review }, dismissed, persisted }
 * POST /api/dashboard/getting-started
 *   { action: "dismiss" } | { action: "complete", step: "download" } -> { ok, persisted }
 *
 * Backs the Overview getting-started checklist. Steps are derived from live
 * data wherever possible; only the download click and the dismissal are
 * stored, in profiles.onboarding (JSONB, migration 20260704). While that
 * column is missing in prod the route reports persisted: false and the client
 * falls back to localStorage, so nothing breaks on schema lag.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchLicenseInstances } from "@/lib/lemonsqueezy";
import { getMyTestimonial } from "@/lib/testimonials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Onboarding = { downloaded_at?: string | null; dismissed_at?: string | null };

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Best-effort read of profiles.onboarding; null + persisted:false when the column is missing. */
async function readOnboarding(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<{ onboarding: Onboarding; persisted: boolean }> {
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("onboarding")
      .eq("id", userId)
      .maybeSingle();
    if (error) return { onboarding: {}, persisted: false };
    const raw = (data as { onboarding?: unknown } | null)?.onboarding;
    const onboarding = raw && typeof raw === "object" ? (raw as Onboarding) : {};
    return { onboarding, persisted: true };
  } catch {
    return { onboarding: {}, persisted: false };
  }
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ show: false });

  const admin = createAdminClient();

  // Subscription: drives the subscribe step and overall visibility.
  let subStatus: string | null = null;
  try {
    const { data } = await admin
      .from("subscriptions")
      .select("status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    subStatus = data && data.length > 0 ? ((data[0] as { status?: string }).status ?? null) : null;
  } catch (err) {
    console.error("getting-started: subscription read failed", err);
  }

  // A cancelled/paused veteran doesn't need onboarding.
  if (subStatus && subStatus !== "active" && subStatus !== "on_trial") {
    return NextResponse.json({ show: false });
  }

  const [{ onboarding, persisted }, profileRes, licenseRes, myTestimonial] = await Promise.all([
    readOnboarding(admin, userId),
    admin.from("profiles").select("display_name,avatar_url").eq("id", userId).maybeSingle(),
    admin
      .from("license_keys")
      .select("ls_license_key_id,activations_count")
      .eq("user_id", userId)
      .limit(1),
    getMyTestimonial(userId),
  ]);

  const profile = profileRes.data as { display_name?: string | null; avatar_url?: string | null } | null;
  const licenseRow =
    licenseRes.data && licenseRes.data.length > 0
      ? (licenseRes.data[0] as { ls_license_key_id?: string | number | null; activations_count?: number | null })
      : null;

  // Activation: live instance count from LS, falling back to the local
  // counter (which only the LS-read backfill ever populates).
  let activated = false;
  if (licenseRow?.ls_license_key_id != null) {
    const instances = await fetchLicenseInstances(String(licenseRow.ls_license_key_id));
    if (instances !== null) {
      activated = instances.length > 0;
    } else {
      activated = (licenseRow.activations_count ?? 0) > 0;
    }
  }

  const steps = {
    subscribe: subStatus === "active" || subStatus === "on_trial",
    // Activation implies a completed download even if the click wasn't tracked.
    download: Boolean(onboarding.downloaded_at) || activated,
    activate: activated,
    profile: Boolean(profile?.display_name || profile?.avatar_url),
    review: myTestimonial !== null,
  };

  return NextResponse.json({
    show: true,
    steps,
    dismissed: Boolean(onboarding.dismissed_at),
    persisted,
  });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { action?: string; step?: string } = {};
  try {
    body = (await request.json()) as { action?: string; step?: string };
  } catch {
    // fall through to bad-request below
  }
  const isDismiss = body.action === "dismiss";
  const isDownload = body.action === "complete" && body.step === "download";
  if (!isDismiss && !isDownload) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { onboarding, persisted } = await readOnboarding(admin, userId);
  if (!persisted) {
    // Column not migrated yet: the client keeps this in localStorage instead.
    return NextResponse.json({ ok: true, persisted: false });
  }

  const next: Onboarding = { ...onboarding };
  const nowIso = new Date().toISOString();
  if (isDismiss) next.dismissed_at = nowIso;
  if (isDownload && !next.downloaded_at) next.downloaded_at = nowIso;

  try {
    const { error } = await admin.from("profiles").update({ onboarding: next }).eq("id", userId);
    if (error) {
      console.error("getting-started: onboarding update failed", error);
      return NextResponse.json({ ok: true, persisted: false });
    }
  } catch (err) {
    console.error("getting-started: onboarding update threw", err);
    return NextResponse.json({ ok: true, persisted: false });
  }
  return NextResponse.json({ ok: true, persisted: true });
}
