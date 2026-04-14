import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

type SignupPayload = {
  email?: string;
  password?: string;
  fullName?: string;
};

export async function POST(request: Request) {
  try {
    getSupabaseEnv();

    const body = (await request.json()) as SignupPayload;
    const email = body.email?.trim();
    const password = body.password;
    const fullName = body.fullName?.trim();

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const supabase = await createClient();
    const redirectTo = `${new URL(request.url).origin}/api/auth/callback`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      const message =
        error.message.toLowerCase() === "fetch failed"
          ? "Unable to connect to Supabase from server. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in production."
          : error.message;

      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      requiresEmailConfirmation: !data.session,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Missing Supabase environment variables.") {
      return NextResponse.json(
        { error: "Supabase is not configured on the server. Please contact support." },
        { status: 500 },
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid signup request payload." }, { status: 400 });
    }

    console.error("Signup route error", error);
    return NextResponse.json({ error: "Unable to create account right now." }, { status: 500 });
  }
}
