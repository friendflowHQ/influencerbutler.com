/**
 * /api/help/questions — thin proxy in front of the in-tree feedback Worker's
 * /questions endpoint. GET is anonymous (forwards query params).
 * POST is bearer-gated by the Worker; the website does not own auth, so
 * we forward the Authorization header verbatim when present.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_WORKER_BASE = "https://influencerbutler-feedback.thesocialmediaposse.workers.dev";

function workerBase(): string {
  return (process.env.FEEDBACK_WORKER_URL || DEFAULT_WORKER_BASE).replace(/\/+$/, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = `${workerBase()}/questions${url.search || ""}`;
  try {
    const res = await fetch(target, {
      method: "GET",
      headers: { accept: "application/json" },
      // Worker sets its own cache headers; we just forward.
      cache: "no-store",
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error)?.message || "Worker unreachable" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const target = `${workerBase()}/questions`;
  const body = await request.text();
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(request.headers.get("authorization")
          ? { authorization: request.headers.get("authorization")! }
          : {}),
      },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error)?.message || "Worker unreachable" },
      { status: 502 },
    );
  }
}
