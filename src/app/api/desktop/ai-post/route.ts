/**
 * POST /api/desktop/ai-post - desktop twin of /api/extension/ai-post (same body and
 * response; the desktop app authenticates with its license key as a Bearer token).
 * Next requires route-segment config to be declared per file, so only the handlers
 * are re-exported.
 */
export { POST, OPTIONS } from "@/app/api/extension/ai-post/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
