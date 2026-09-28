// Shared design tokens for the deal-site UIs (the corner badge and the
// per-card "Send to Deals" chip). These two run as their own standalone
// content-script bundle and deliberately do NOT import the shared overlay
// stylesheet (that would pull the whole panel CSS into a bundle that only
// needs a badge and a pill). To still read as the same product as the Amazon
// floating panel, they mirror the panel's tokens here instead.
//
// Every value is copied from extension/src/ui/overlay.css, which stays the
// source of truth; the line reference next to each token says where. Keep
// these in sync when the panel's look changes.

// Panel body font (overlay.css .panel).
export const FONT_STACK = `"Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;

// Card surface (overlay.css .panel): white, hairline border, 16px radius, the
// layered drop shadow, slate text.
export const CARD_BG = "#ffffff";
export const CARD_BORDER = "#e7ecf3";
export const CARD_RADIUS = "16px";
export const CARD_SHADOW = "0 18px 44px rgba(15, 23, 42, 0.22), 0 2px 8px rgba(15, 23, 42, 0.06)";
export const TEXT = "#0f172a";
export const TEXT_MUTED = "#64748b";

// Header (overlay.css .header): warm wash + hairline divider.
export const HEADER_WASH = "linear-gradient(180deg, #fffaf5 0%, #ffffff 100%)";
export const DIVIDER = "#f1f5f9";

// Brand wordmark (overlay.css .header .title): the orange to amber gradient,
// clipped to the text.
export const WORDMARK_GRADIENT = "linear-gradient(90deg, #ea580c, #f59e0b)";

// Primary button (overlay.css .btn): filled orange to amber gradient with a
// soft glow. Hover mirrors the panel (brightness + a lifted shadow).
export const PRIMARY_GRADIENT = "linear-gradient(135deg, #f97316 0%, #f59e0b 100%)";
export const PRIMARY_SHADOW = "0 6px 16px rgba(249, 115, 22, 0.28)";
export const PRIMARY_SHADOW_HOVER = "0 8px 20px rgba(249, 115, 22, 0.34)";

// Semantic states (overlay.css .chip.good / .chip.bad and the amber warn set),
// reused for the chip's sent / error / pending feedback.
export const GOOD = "#15803d";
export const BAD = "#b91c1c";
export const PENDING = "#b45309";
