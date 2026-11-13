import { UI_PREFIX } from "../../shared/constants";
import { askBackground } from "../../shared/messages";
import { getLocale } from "../../i18n";
import { getSettings } from "../../storage/store";
import { DEALS_CATALOG } from "../../deals/strings";
import { DEAL_CAPTURE_CATALOG } from "../../walmart/deal-capture-strings";
import {
  collectWalmartDeals,
  WALMART_DEAL_CAPTURE_MAX,
} from "../../walmart/deal-capture";
import type { HudCommandResult } from "../../transport/hud-commands";
import { sendCapturedDeals, type CaptureStrings } from "./send";
import logoUrl from "../../../static/icons/icon-48.png";
import {
  FONT_STACK,
  CARD_BG,
  CARD_BORDER,
  CARD_SHADOW,
  TEXT,
  TEXT_MUTED,
  PRIMARY_GRADIENT,
  PRIMARY_SHADOW,
  PRIMARY_SHADOW_HOVER,
  GOOD,
  BAD,
} from "../../deal-badge/theme";

// The floating "Send these deals to Influencer Butler" button on walmart.com
// deal pages (/shop/deals/black-friday, /shop/deals/cyber-monday, ...). On
// click it reads the product tiles already in the page (nothing is fetched,
// and Walmart's human check is never touched) and sends them to the desktop
// app's Black Friday Deals table in Walmart Butler as walmartEvent.capture.
// Same look as the deal-site badge and chips (deal-badge/theme.ts).

const HOST_CLASS = `${UI_PREFIX}-walmart-deal-capture-host`;
// A cold app answering 200 products can take longer than the default
// background round trip; the bridge itself gives up after 20 seconds.
const SEND_TIMEOUT_MS = 45_000;

let dismissed = false;

export function removeWalmartDealCapture(): void {
  document.querySelectorAll(`.${HOST_CLASS}`).forEach((el) => el.remove());
}

export function initWalmartDealCapture(): void {
  // Hidden by the creator for this page view (an SPA hop to another deal page
  // keeps it hidden until the next full load).
  if (dismissed) return;
  if (document.querySelector(`.${HOST_CLASS}`)) return;

  const locale = getLocale();
  const D = DEAL_CAPTURE_CATALOG[locale];
  const deals = DEALS_CATALOG[locale];
  const dict: CaptureStrings = {
    ...D,
    appNotRunning: deals.cardAppNotRunning,
    needsPairing: deals.cardNeedsPairing,
  };

  const host = document.createElement("div");
  host.className = HOST_CLASS;
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = CSS;

  const wrap = document.createElement("div");
  wrap.className = "wrap";

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.id = "ib-wdc-hint";
  hint.setAttribute("role", "tooltip");
  hint.textContent = D.hint;

  const status = document.createElement("div");
  status.className = "status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;

  const row = document.createElement("div");
  row.className = "row";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "send";
  btn.setAttribute("aria-describedby", hint.id);
  const logo = document.createElement("img");
  logo.className = "logo";
  logo.src = logoUrl;
  logo.alt = "";
  const label = document.createElement("span");
  label.textContent = D.button;
  btn.append(logo, label);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.textContent = "×";
  close.setAttribute("aria-label", D.dismiss);
  close.title = D.dismiss;
  close.onclick = () => {
    dismissed = true;
    host.remove();
  };

  const showStatus = (message: string, tone: "info" | "good" | "bad"): void => {
    status.hidden = false;
    status.dataset.tone = tone;
    status.textContent = message;
  };

  btn.onclick = async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    showStatus(D.reading, "info");
    try {
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/ip/"]'));
      const { products, capped } = collectWalmartDeals(anchors, {
        base: location.href,
        max: WALMART_DEAL_CAPTURE_MAX,
      });
      const settings = await getSettings();
      const outcome = await sendCapturedDeals({
        products,
        pageUrl: location.href,
        // Same Deal Posting target the Send to Deals chips use; the desktop
        // maps it to its Black Friday Event Finder.
        workspace: settings.deals.workspace,
        capped,
        capMax: WALMART_DEAL_CAPTURE_MAX,
        dict,
        send: (command) =>
          askBackground<HudCommandResult & { viaRemote?: boolean }>(
            { kind: "SEND_HUD_COMMAND", command },
            SEND_TIMEOUT_MS,
          ),
        onProgress: (sent, total) => showStatus(D.sending(sent, total), "info"),
      });
      showStatus(outcome.message, outcome.ok ? "good" : "bad");
    } catch {
      showStatus(D.failed, "bad");
    } finally {
      btn.disabled = false;
    }
  };

  row.append(btn, close);
  wrap.append(hint, status, row);
  root.append(style, wrap);
  document.documentElement.append(host);
}

// Light only, like the deal-site badge and the Amazon panel. Bottom LEFT so it
// never sits on the extension's own chat launcher or panel (bottom right).
const CSS = `
:host { all: initial; }
.wrap {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 2147483646;
  max-width: min(360px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  font: 13px/1.45 ${FONT_STACK};
  color: ${TEXT};
}
.row { display: flex; align-items: center; gap: 6px; }
.send {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 999px;
  padding: 8px 14px 8px 8px;
  font: inherit;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #fff;
  background: ${PRIMARY_GRADIENT};
  box-shadow: ${PRIMARY_SHADOW};
  cursor: pointer;
  text-align: left;
  transition: filter 0.12s ease, box-shadow 0.12s ease, transform 0.02s ease;
}
.send:hover { filter: brightness(0.96); box-shadow: ${PRIMARY_SHADOW_HOVER}; }
.send:active { transform: translateY(1px); }
.send:disabled { cursor: progress; filter: saturate(0.7); }
.send:focus-visible, .close:focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }
.logo {
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: 999px;
  background: #fff;
  padding: 2px;
  box-sizing: border-box;
  object-fit: contain;
}
.close {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid ${CARD_BORDER};
  background: ${CARD_BG};
  color: ${TEXT_MUTED};
  font: 16px/1 ${FONT_STACK};
  cursor: pointer;
  box-shadow: ${CARD_SHADOW};
}
.close:hover { color: #c2410c; }
.hint, .status {
  box-sizing: border-box;
  padding: 9px 12px;
  border-radius: 12px;
  background: ${CARD_BG};
  border: 1px solid ${CARD_BORDER};
  box-shadow: ${CARD_SHADOW};
}
.hint { display: none; color: ${TEXT_MUTED}; }
.wrap:hover .hint, .wrap:focus-within .hint { display: block; }
.status[hidden] { display: none; }
.status { font-weight: 600; }
.status[data-tone="good"] { color: ${GOOD}; }
.status[data-tone="bad"] { color: ${BAD}; }
`;
