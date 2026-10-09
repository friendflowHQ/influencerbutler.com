import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GRACE_DAYS,
  cancelDeletion,
  deletionBlocker,
  getPendingDeletion,
  requestDeletion,
} from "@/lib/account-deletion";
import { sendDeletionScheduledEmail } from "@/lib/account-deletion-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Self-serve account deletion for the signed-in user.
 *
 *   GET    -> { pending, scheduledFor, blocker, graceDays }
 *   POST   -> { confirmEmail }  schedule deletion GRACE_DAYS days out
 *   DELETE -> cancel a pending deletion
 *
 * The person is identified from their session cookie, never from the body.
 * Deleting needs the account's own email typed back as confirmation. All writes
 * go through the service-role client (the tables involved have no user RLS).
 * Cross-site requests are rejected centrally by the CSRF guard in src/middleware.ts.
 */

async function sessionUser() {
  const cookieStore = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // read-only here
        },
      },
    },
  );
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const admin = createAdminClient();
    const [pending, blocker] = await Promise.all([
      getPendingDeletion(admin, user.id),
      deletionBlocker(admin, user.id, user.email),
    ]);
    return NextResponse.json({
      pending: Boolean(pending),
      scheduledFor: pending?.scheduledFor ?? null,
      blocker,
      graceDays: GRACE_DAYS,
    });
  } catch (error) {
    console.error("account/delete GET failed", error);
    return NextResponse.json({ error: "Could not load deletion status." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { confirmEmail?: unknown };
  try {
    body = (await request.json()) as { confirmEmail?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (user.email ?? "").trim().toLowerCase();
  const typed = typeof body.confirmEmail === "string" ? body.confirmEmail.trim().toLowerCase() : "";
  if (!email || typed !== email) {
    return NextResponse.json({ error: "That email does not match your account." }, { status: 409 });
  }

  try {
    const admin = createAdminClient();
    const result = await requestDeletion(admin, user.id, user.email);
    if (!result.ok) {
      if (result.code === "subscription") {
        return NextResponse.json(
          {
            error:
              "You have an active subscription. Cancel it on the Subscription page first, then request deletion.",
            code: "subscription",
          },
          { status: 409 },
        );
      }
      if (result.code === "staff") {
        return NextResponse.json(
          { error: "This account cannot be deleted here. Email privacy@influencerbutler.com.", code: "staff" },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "We could not schedule deletion right now. Please try again, or email privacy@influencerbutler.com." },
        { status: 503 },
      );
    }

    if (!result.alreadyPending && user.email) {
      // Best-effort: the request is recorded even if the email fails.
      await sendDeletionScheduledEmail(user.email, result.scheduledFor).catch((e) =>
        console.error("account/delete: scheduled email failed", e),
      );
    }
    return NextResponse.json({ ok: true, scheduledFor: result.scheduledFor, graceDays: GRACE_DAYS });
  } catch (error) {
    console.error("account/delete POST failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    await cancelDeletion(createAdminClient(), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("account/delete DELETE failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
