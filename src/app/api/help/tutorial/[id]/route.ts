/**
 * GET /api/help/tutorial/[id]?locale=en-US — returns the rendered HTML +
 * frontmatter for a single tutorial. Falls back to en-US when the
 * requested locale is missing.
 */
import { NextResponse } from "next/server";
import { loadTutorial } from "@/lib/tutorials";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale") || "en-US";

  const tutorial = await loadTutorial(id, locale);
  if (!tutorial) {
    return NextResponse.json(
      { ok: false, error: "Tutorial not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      id: tutorial.id,
      locale: tutorial.locale,
      frontmatter: tutorial.frontmatter,
      html: tutorial.html,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
