import { addSection, el } from "../../ui/components";
import type { ProductSignals } from "../../amazon/product-signals";
import { buildConversationChip } from "./chip";
import { loadConversationLookup } from "./data";

// The product page's "Brand conversation" section: where you stand with this
// product's brand, with a click through to the conversation. Reserved hidden and
// revealed only when the brand has a conversation, so it never shows an empty box.
export function renderBrandConversation(signals: ProductSignals): void {
  if (!signals.asin && !signals.brand && !signals.title) return;
  const section = addSection("Brand conversation");
  section.style.display = "none";
  void fill(section, signals);
}

async function fill(section: HTMLElement, signals: ProductSignals): Promise<void> {
  let chip;
  try {
    const lookup = await loadConversationLookup();
    chip = lookup?.resolve({ brand: signals.brand, title: signals.title }) ?? null;
  } catch {
    chip = null;
  }
  if (!chip) {
    section.remove();
    return;
  }
  const row = el("div", "counts");
  row.append(buildConversationChip(chip));
  section.append(row);
  section.append(el("p", "note", chip.tip));
  section.style.display = "";
}
