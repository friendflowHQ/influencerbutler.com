/**
 * Generates the branded cover image for a group event: an AI backdrop in the
 * blog hero style (gpt-image-1 + STYLE_SUFFIX, via generateHeroImage) with the
 * event title, date, and time overlaid, then stores the PNG in the public
 * Supabase Storage bucket "event-images" and returns its URL.
 *
 * The overlay is composited with next/og's ImageResponse (built into Next; no
 * sharp, which is a local-scripts-only tool here). Everything is best-effort:
 * if the AI backdrop fails (e.g. OPENAI_API_KEY missing) we still render a
 * branded gradient card so events always get an image, and any hard failure
 * returns null so the caller degrades to "no image" rather than erroring.
 *
 * Palette matches scripts/generate-pinterest-pins.mjs: navy #0f172a, orange
 * #f97316. Output is 1200x630 (OG standard), reused for the card, emails, and
 * the social share unfurl.
 */
import { ImageResponse } from "next/og";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateHeroImage } from "./blog-hero";
import {
  buildScenePrompt,
  formatEventDate,
  formatEventTime,
  titleFontSize,
} from "./event-image-text";

const BUCKET = "event-images";
const NAVY = "#0f172a";
const ORANGE = "#f97316";
const CREAM = "#fdf6ec";

export type EventImageInput = {
  id: string;
  title: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  timezone: string;
};

/** The AI backdrop as a data URL, or null when generation is unavailable. */
async function backdropDataUrl(title: string): Promise<string | null> {
  try {
    const b64 = await generateHeroImage(buildScenePrompt(title));
    return `data:image/png;base64,${b64}`;
  } catch (e) {
    console.error("[event-image] backdrop generation failed, using gradient", e);
    return null;
  }
}

function renderCard(event: EventImageInput, backdrop: string | null): ImageResponse {
  const title = (event.title || "Live event").trim();
  const dateLine = formatEventDate(event.startsAt, event.timezone);
  const timeLine = formatEventTime(event.startsAt, event.endsAt, event.timezone);

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          width: "1200px",
          height: "630px",
          backgroundColor: NAVY,
          backgroundImage: `linear-gradient(135deg, ${NAVY} 0%, #1e293b 100%)`,
          fontFamily: "sans-serif",
        }}
      >
        {backdrop ? (
          // This <img> is drawn into the generated PNG by satori, not the DOM.
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img
            src={backdrop}
            width={1200}
            height={630}
            style={{ position: "absolute", top: 0, left: 0, width: "1200px", height: "630px", objectFit: "cover" }}
          />
        ) : null}
        {/* Legibility scrim: transparent at the top, deep navy at the bottom. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "1200px",
            height: "630px",
            backgroundImage:
              "linear-gradient(180deg, rgba(15,23,42,0.15) 0%, rgba(15,23,42,0.55) 55%, rgba(15,23,42,0.92) 100%)",
          }}
        />
        {/* Orange accent bar down the left edge. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "14px",
            height: "630px",
            backgroundColor: ORANGE,
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            padding: "64px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "24px",
              fontWeight: 700,
              letterSpacing: "3px",
              color: ORANGE,
              textTransform: "uppercase",
            }}
          >
            Influencer Butler : Live Event
          </div>
          <div
            style={{
              display: "flex",
              marginTop: "18px",
              fontSize: `${titleFontSize(title)}px`,
              fontWeight: 800,
              lineHeight: 1.08,
              color: "#ffffff",
              maxWidth: "980px",
            }}
          >
            {title}
          </div>
          {dateLine ? (
            <div style={{ display: "flex", marginTop: "26px", fontSize: "34px", fontWeight: 700, color: CREAM }}>
              {dateLine}
            </div>
          ) : null}
          {timeLine ? (
            <div style={{ display: "flex", marginTop: "6px", fontSize: "30px", fontWeight: 700, color: ORANGE }}>
              {timeLine}
            </div>
          ) : null}
          <div style={{ display: "flex", marginTop: "30px", fontSize: "22px", fontWeight: 600, color: "rgba(253,246,236,0.75)" }}>
            influencerbutler.com
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

/**
 * Generate + store the event cover image. Returns the public URL (with a cache
 * -busting suffix so a regenerate is visible), or null on any failure.
 */
export async function generateEventImage(
  event: EventImageInput,
  admin: SupabaseClient,
): Promise<string | null> {
  try {
    const backdrop = await backdropDataUrl(event.title);
    const img = renderCard(event, backdrop);
    const bytes = new Uint8Array(await img.arrayBuffer());

    const path = `events/${event.id}.png`;
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: "image/png",
      upsert: true,
    });
    if (error) {
      console.error("[event-image] storage upload failed", error.message);
      return null;
    }
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) return null;
    // Cache-bust so a regenerate (same path, upsert) shows the new image.
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch (e) {
    console.error("[event-image] generate failed", e);
    return null;
  }
}
