/**
 * /api/extension/plan - the Chrome extension's window onto the Beginner /
 * Power User plan. GET proxies the licensing Worker's GET /billing/plan-options
 * (current plan, the one-click Power User upgrade with its live price, the
 * price-change notice); POST { target: "power" } proxies POST
 * /billing/change-plan (prorated in-place switch, same license key).
 *
 * The extension's Bearer license key is forwarded verbatim and the Worker
 * authenticates it exactly as the desktop app's own calls; this site never
 * holds the Lemon Squeezy API key and never sees the subscription id. Every
 * Worker answer is passed through unchanged (including its ok:false codes:
 * not_eligible, unconfigured, no-subscription) so the popup can localize.
 */
import { jsonWithCors, optionsResponse } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_WORKER_URL = "https://licensing.influencerbutler.com";

function workerUrl(): string {
  return (process.env.BB_LICENSING_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, "");
}

function bearer(request: Request): string {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  return m ? m[1].trim() : "";
}

async function proxy(request: Request, method: "GET" | "POST", path: string, body?: unknown) {
  const key = bearer(request);
  if (!key || key.length < 8 || key.length > 200) {
    return jsonWithCors({ ok: false, error: "License required" }, 401);
  }
  let res: Response;
  try {
    res = await fetch(`${workerUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(method === "POST" ? 45_000 : 15_000),
    });
  } catch (error) {
    console.warn("extension/plan: licensing worker unreachable", error);
    return jsonWithCors({ ok: false, error: "Licensing service unavailable" }, 502);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!json || typeof json !== "object") {
    return jsonWithCors({ ok: false, error: `Licensing service answered ${res.status}` }, 502);
  }
  return jsonWithCors(json as Record<string, unknown>, res.status);
}

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  return proxy(request, "GET", "/billing/plan-options");
}

export async function POST(request: Request) {
  let body: { target?: unknown } = {};
  try {
    body = (await request.json()) as { target?: unknown };
  } catch {
    body = {};
  }
  const target = typeof body.target === "string" && body.target.trim() ? body.target.trim().toLowerCase() : "power";
  return proxy(request, "POST", "/billing/change-plan", { target });
}
