/**
 * POST /api/ai-concierge/session
 * Mints a short-lived OpenAI Realtime ephemeral client secret for the signed-in
 * user, seeded with the Butler AI persona + tools. The real OPENAI_API_KEY never
 * reaches the browser. Signed-in only, with a per-user daily session cap so a
 * metered voice API cannot run away.
 *
 * Dependencies: @/lib/supabase/server, @/lib/scheduling-server,
 * @/lib/ai-concierge/agent, @/lib/ai-concierge/config.
 */
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/lib/scheduling-server";
import { buildInstructions, toRealtimeTools } from "@/lib/ai-concierge/agent";
import { REALTIME_MODEL, REALTIME_VOICE, MAX_SESSION_SECS, DAILY_SESSION_LIMIT } from "@/lib/ai-concierge/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Voice concierge is not configured yet." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Per-user daily cap (best-effort; also bounded by the client-side timer).
  const admin = getAdmin();
  if (admin) {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count } = await admin
      .from("ai_concierge_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("started_at", since.toISOString());
    if ((count ?? 0) >= DAILY_SESSION_LIMIT) {
      return NextResponse.json(
        { error: `You have reached today's limit of ${DAILY_SESSION_LIMIT} AI sessions. Please try again tomorrow, or book a human call.` },
        { status: 429 },
      );
    }
  }

  try {
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Privacy-preserving per-user id for OpenAI abuse monitoring (not the raw id).
        "OpenAI-Safety-Identifier": createHash("sha256").update(user.id).digest("hex").slice(0, 32),
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions: buildInstructions(),
          audio: { output: { voice: REALTIME_VOICE } },
          tools: toRealtimeTools(),
          tool_choice: "auto",
        },
      }),
    });
    if (!res.ok) {
      console.error("[ai-concierge/session] mint failed", res.status, await res.text().catch(() => ""));
      return NextResponse.json({ error: "Could not start the voice session. Please try again." }, { status: 502 });
    }
    const json = (await res.json()) as { value?: string; expires_at?: number };
    if (!json.value) return NextResponse.json({ error: "No session token returned." }, { status: 502 });

    // Log the session now (started), so the daily cap counts started sessions,
    // not just completed ones. The transcript route fills it in at the end.
    let sessionId: string | null = null;
    if (admin) {
      const { data: row, error } = await admin
        .from("ai_concierge_sessions")
        .insert({ user_id: user.id, user_email: user.email ?? null, mode: "voice" })
        .select("id")
        .single();
      if (error) console.error("[ai-concierge/session] insert", error.message);
      sessionId = (row?.id as string) ?? null;
    }

    return NextResponse.json({
      value: json.value,
      expiresAt: json.expires_at ?? null,
      model: REALTIME_MODEL,
      maxSessionSecs: MAX_SESSION_SECS,
      sessionId,
    });
  } catch (err) {
    console.error("[ai-concierge/session] threw", err);
    return NextResponse.json({ error: "Could not start the voice session." }, { status: 502 });
  }
}
