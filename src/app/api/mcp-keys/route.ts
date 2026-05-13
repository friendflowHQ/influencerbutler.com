import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/admin";
import { hashApiKey } from "@/lib/mcp/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type KeyRow = {
  id: string;
  prefix: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

async function getUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await (supabase as unknown as {
      auth: { getUser: () => Promise<{ data: { user: { id?: string } | null } }> };
    }).auth.getUser();
    return data.user?.id ?? null;
  } catch (error) {
    console.error("mcp-keys: getUser failed", error);
    return null;
  }
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  try {
    const result = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            order: (col: string, opts: { ascending: boolean }) => Promise<{
              data: KeyRow[] | null;
              error: unknown;
            }>;
          };
        };
      };
    })
      .from("mcp_api_keys")
      .select("id, prefix, label, created_at, last_used_at, revoked_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    return NextResponse.json({ keys: result.data ?? [] });
  } catch (error) {
    console.error("mcp-keys list failed", error);
    return NextResponse.json({ error: "List failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let label = "";
  try {
    const body = (await request.json()) as { label?: string };
    label = (body.label ?? "").toString().slice(0, 80);
  } catch {
    // body is optional
  }

  const random = randomBytes(24).toString("base64url");
  const plaintext = `ib_pat_${random}`;
  const prefix = plaintext.slice(0, 12);
  const keyHash = hashApiKey(plaintext);

  try {
    const result = await (admin as unknown as {
      from: (t: string) => {
        insert: (p: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
    })
      .from("mcp_api_keys")
      .insert({ user_id: userId, key_hash: keyHash, prefix, label: label || null });
    if (result.error) {
      console.error("mcp-keys insert failed", result.error);
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }
  } catch (error) {
    console.error("mcp-keys insert threw", error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ token: plaintext, prefix, label });
}

export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  try {
    await (admin as unknown as {
      from: (t: string) => {
        update: (p: Record<string, unknown>) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => Promise<{ error: unknown }>;
          };
        };
      };
    })
      .from("mcp_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
  } catch (error) {
    console.error("mcp-keys revoke failed", error);
    return NextResponse.json({ error: "Revoke failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
