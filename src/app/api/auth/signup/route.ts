import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type SignupPayload = {
  email?: string;
  password?: string;
  fullName?: string;
};

export async function POST(request: Request) {
  try {
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
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      requiresEmailConfirmation: !data.session,
    });
  } catch (error) {
    console.error("Signup route error", error);
    return NextResponse.json({ error: "Unable to create account right now." }, { status: 500 });
  }
}
