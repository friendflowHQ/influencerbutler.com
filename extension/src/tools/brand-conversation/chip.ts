import { sendToBackground } from "../../shared/messages";
import { el } from "../../ui/components";
import { openBrandConversation } from "../cc-messages/open-conversation";
import { buildDesktopOpenUrl, creatorConnectionsUrl, onCreatorConnectionsPage } from "./open";
import type { ConversationChip } from "./status";

// The chip a product card carries for its brand's conversation. The main button
// opens the conversation in Creator Connections; when the desktop app also holds
// the thread, a second small button opens it in Messenger Butler. Both stop the
// click from reaching the tile's own product link, and are real buttons so the
// chip is keyboard and screen-reader usable.

export function openInCreatorConnections(brand: string): void {
  if (onCreatorConnectionsPage(location.hostname)) {
    void openBrandConversation(brand);
    return;
  }
  void sendToBackground<void>({ kind: "OPEN_URL", url: creatorConnectionsUrl(brand) });
}

export function openInDesktopApp(brand: string): void {
  void sendToBackground<void>({ kind: "OPEN_URL", url: buildDesktopOpenUrl(brand) });
}

export function buildConversationChip(chip: ConversationChip): HTMLElement {
  const wrap = el("span", "tile-convo");

  const main = el("button", `tile-chip convo-chip${chip.tone === "good" ? " good" : ""}`, chip.label);
  main.type = "button";
  main.title = `${chip.tip}. Click to open the conversation.`;
  main.setAttribute("aria-label", `${chip.label}. Open the conversation with ${chip.brand} in Creator Connections`);
  main.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openInCreatorConnections(chip.brand);
  });
  wrap.append(main);

  if (chip.inApp) {
    const app = el("button", "tile-chip convo-app", "App");
    app.type = "button";
    app.title = `Open the conversation with ${chip.brand} in the desktop app`;
    app.setAttribute("aria-label", `Open the conversation with ${chip.brand} in the desktop app`);
    app.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openInDesktopApp(chip.brand);
    });
    wrap.append(app);
  }
  return wrap;
}
