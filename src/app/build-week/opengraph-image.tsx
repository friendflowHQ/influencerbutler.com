/**
 * Summary: Social share card for /build-week (1200x630). Drawn with next/og so
 *   there is no binary asset to maintain. Palette matches the event images:
 *   navy #0f172a, orange #f97316. Plain English text on purpose (one share image
 *   for every language of the page).
 * Dependencies: next/og.
 */
import { ImageResponse } from "next/og";

export const alt = "Influencer Butler Build Week: pitch a Butler, built in a week or you get lifetime access";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0f172a",
          padding: "64px 72px",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
          <div
            style={{
              display: "flex",
              background: "#f97316",
              color: "#0f172a",
              padding: "8px 18px",
              borderRadius: 999,
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: 2,
            }}
          >
            BUILD WEEK
          </div>
          <div style={{ display: "flex", color: "#cbd5e1" }}>Nov 2 to 8</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
            Pitch a Butler.
          </div>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 700, lineHeight: 1.15, color: "#fdba74" }}>
            We build it in a week, or you get lifetime access.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#cbd5e1" }}>
          <div style={{ display: "flex" }}>Influencer Butler</div>
          <div style={{ display: "flex" }}>influencerbutler.com/build-week</div>
        </div>
      </div>
    ),
    size,
  );
}
