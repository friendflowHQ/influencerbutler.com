import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApplyRequestBody = {
  fullName?: string;
  email?: string;
  password?: string;
  website?: string;
  audienceSize?: string;
  niche?: string;
  promotionStrategy?: string;
  agreedToTerms?: boolean;
  socialHandles?: Record<string, string>;
};

type SupabaseLike = {
  auth: {
    getUser: () => Promise<{ data: { user: { id: string; email?: string | null } | null } }>;
    signUp: (args: {
      email: string;
      password: string;
      options?: { data?: Record<string, unknown>; emailRedirectTo?: string };
    }) => Promise<{
      data: { user: { id: string } | null };
      error: { message: string } | null;
    }>;
    signInWithPassword: (args: {
      email: string;
      password: string;
    }) => Promise<{ error: { message: string } | null }>;
  };
  from: (table: string) => {
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
};

function sanitizeSocials(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim().length > 0) {
      out[key] = value.trim().slice(0, 200);
    }
  }
  return out;
}

async function notifyAdmin(summary: Record<string, unknown>) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!apiKey || !to) return;

  try {
    const body = {
      from: "Influencer Butler <affiliates@influencerbutler.com>",
      to: [to],
      subject: `New affiliate application: ${summary.fullName ?? summary.email ?? "Unknown"}`,
      text: JSON.stringify(summary, null, 2),
    };
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("Affiliate admin notification failed", error);
  }
}

export async function POST(request: Request) {
  let payload: ApplyRequestBody;

  try {
    payload = (await request.json()) as ApplyRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fullName = payload.fullName?.trim() ?? "";
  const email = payload.email?.trim().toLowerCase() ?? "";
  const password = payload.password ?? "";
  const promotionStrategy = payload.promotionStrategy?.trim() ?? "";

  if (!fullName || !email || !password || !promotionStrategy) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!payload.agreedToTerms) {
    return NextResponse.json({ error: "You must agree to the affiliate terms" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }
  if (promotionStrategy.length < 30) {
    return NextResponse.json(
      { error: "Please describe your promotion strategy in at least 30 characters" },
      { status: 400 },
    );
  }

  const supabase = (await createClient()) as unknown as SupabaseLike;

  // Reuse session if already signed in; otherwise sign the applicant up.
  let userId: string | null = null;
  let requiresEmailConfirmation = false;

  const {
    data: { user: existingUser },
  } = await supabase.auth.getUser();

  if (existingUser) {
    userId = existingUser.id;
  } else {
    const origin = new URL(request.url).origin;
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${origin}/api/auth/callback`,
      },
    });

    if (signUpError) {
      return NextResponse.json({ error: signUpError.message }, { status: 400 });
    }

    userId = signUpData.user?.id ?? null;

    // Try to sign in — works only if email confirmation is disabled.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      requiresEmailConfirmation = true;
    }
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Could not create account. Please try again." },
      { status: 500 },
    );
  }

  const { error: upsertError } = await supabase.from("affiliate_applications").upsert(
    {
      user_id: userId,
      email,
      full_name: fullName,
      website: payload.website?.trim() || null,
      social_handles: sanitizeSocials(payload.socialHandles),
      audience_size: payload.audienceSize?.trim() || null,
      niche: payload.niche?.trim() || null,
      promotion_strategy: promotionStrategy,
      agreed_to_terms: true,
      status: "pending",
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    console.error("Failed to save affiliate application", upsertError);
    return NextResponse.json(
      { error: "Could not save your application. Please try again." },
      { status: 500 },
    );
  }

  // Best-effort admin notification (non-blocking failures).
  await notifyAdmin({
    userId,
    fullName,
    email,
    website: payload.website,
    audienceSize: payload.audienceSize,
    niche: payload.niche,
    socialHandles: sanitizeSocials(payload.socialHandles),
    promotionStrategy,
  });

  return NextResponse.json({ ok: true, requiresEmailConfirmation });
}
