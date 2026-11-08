// GET /api/admin/stores/asset?product=&kind=cover|file&file=
//
// Opens a creator's product cover or file for the admin Creator stores page:
// checks Finance permission + step-up, then redirects to a 15-minute signed
// link on the links Worker (the file streams from there, not through Vercel).

import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/finance-stepup";
import { signedAdminAssetUrl } from "@/lib/links-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export async function GET(request: Request) {
  const gate = await requireFinance("finance.view", request);
  if (!gate.ok) return gate.response;

  const params = new URL(request.url).searchParams;
  const productId = params.get("product") ?? "";
  const kind = params.get("kind") === "cover" ? "cover" : "file";
  const fileId = params.get("file") ?? "";
  if (!ID_RE.test(productId) || (kind === "file" && !ID_RE.test(fileId))) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const url = signedAdminAssetUrl(productId, kind, fileId);
  if (!url) return NextResponse.json({ error: "LINKS_ADMIN_TOKEN is not set on the website." }, { status: 503 });
  return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "private, no-store" } });
}
