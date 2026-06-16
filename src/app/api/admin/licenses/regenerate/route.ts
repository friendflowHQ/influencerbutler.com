import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { lsLicenseKeyId?: string; note?: string };

/**
 * Guided regenerate. Lemon Squeezy owns license-key issuance and there is no
 * safe programmatic "reissue" we can call without risking a mismatch with LS, so
 * this records intent + audit and points the operator at the LS dashboard. Gated
 * by licenses.regenerate.
 */
export async function POST(request: Request) {
  const actor = await requirePermission("licenses.regenerate", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = (body.lsLicenseKeyId ?? "").trim() || null;
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  await logAdminAction({
    actor,
    action: "licenses.regenerate.intent",
    targetType: "license",
    targetId: id,
    details: { note },
  });

  return NextResponse.json({
    ok: true,
    guided: true,
    deepLink: "https://app.lemonsqueezy.com/licenses",
    message:
      "License reissue is done in the Lemon Squeezy dashboard. This request has been logged.",
  });
}
