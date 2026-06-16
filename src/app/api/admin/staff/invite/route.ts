import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { sanitizePermissions } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InviteBody = {
  email?: string;
  label?: string;
  permissions?: unknown;
};

type InviteClient = {
  from: (table: string) => {
    select: (cols: string) => {
      ilike: (
        col: string,
        value: string,
      ) => { maybeSingle: () => Promise<{ data: { id?: string } | null; error: unknown }> };
    };
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
  auth: {
    admin: {
      createUser: (attrs: {
        email: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
      }) => Promise<{
        data: { user: { id: string } | null };
        error: { message?: string } | null;
      }>;
      listUsers: (params?: { page?: number; perPage?: number }) => Promise<{
        data: { users: { id: string; email?: string | null }[] } | null;
        error: { message?: string } | null;
      }>;
      generateLink: (attrs: {
        type: "magiclink" | "invite";
        email: string;
        options?: { redirectTo?: string };
      }) => Promise<{
        data: { properties?: { action_link?: string } | null } | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function findUserIdByEmail(supabase: InviteClient, email: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (data?.id) return data.id;
  // Fall back to scanning auth.users (profile row may not exist yet).
  try {
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
    return match?.id ?? null;
  } catch (err) {
    console.error("staff/invite: listUsers threw", err);
    return null;
  }
}

async function sendInviteEmail(to: string, actionLink: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("staff/invite: RESEND_API_KEY not set - invite email skipped");
    return false;
  }
  const body = [
    `You've been added as an assistant on Influencer Butler.`,
    ``,
    `Click the link below to sign in and access your admin tools:`,
    ``,
    `    ${actionLink}`,
    ``,
    `This link signs you in automatically. Once in, you can set a password from account settings.`,
    ``,
    `- The Influencer Butler team`,
  ].join("\n");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Influencer Butler <hello@influencerbutler.com>",
        to: [to],
        subject: "Your Influencer Butler assistant access",
        text: body,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("staff/invite: Resend send threw", err);
    return false;
  }
}

export async function POST(request: Request) {
  const actor = await requirePermission("staff.manage", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: InviteBody;
  try {
    body = (await request.json()) as InviteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.trim() || null : null;
  const permissions = sanitizePermissions(body.permissions);

  const supabase = createAdminClient() as unknown as InviteClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Find or create the auth user.
  let userId = await findUserIdByEmail(supabase, email);
  let created = false;
  if (!userId) {
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { created_via: "staff_invite" },
    });
    if (createError || !createData.user?.id) {
      // Possible race; re-look up.
      userId = await findUserIdByEmail(supabase, email);
      if (!userId) {
        console.error("staff/invite: createUser failed", createError);
        return NextResponse.json({ error: "Could not create the user account." }, { status: 500 });
      }
    } else {
      userId = createData.user.id;
      created = true;
    }
  }

  // Grant / refresh the staff_members row.
  const { error: upsertErr } = await supabase.from("staff_members").upsert(
    {
      user_id: userId,
      email,
      role: "assistant",
      permissions,
      is_active: true,
      label,
      created_by: actor.userId,
      invited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (upsertErr) {
    console.error("staff/invite: upsert failed", upsertErr);
    return NextResponse.json({ error: "Could not save the assistant." }, { status: 500 });
  }

  // Send a sign-in link.
  const siteUrl =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  let emailSent = false;
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl.replace(/\/$/, "")}/dashboard` },
  });
  const actionLink = linkData?.properties?.action_link ?? null;
  if (linkErr || !actionLink) {
    console.error("staff/invite: generateLink failed", linkErr);
  } else {
    emailSent = await sendInviteEmail(email, actionLink);
  }

  await logAdminAction({
    actor,
    action: "staff.invite",
    targetType: "user",
    targetId: userId,
    details: { email, permissions, created, emailSent },
  });

  return NextResponse.json({ ok: true, userId, created, emailSent, permissions });
}
