import { addSection, el } from "../../ui/components";
import { t } from "../../i18n";
import { sendToBackground, type ProductListsResult } from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";

// Product-page "Add to list" panel. The search overlay's tile menu already adds
// a single product; this is the product-page counterpart, and the only place
// that offers "Add all variations": a listing's sibling ASINs come from the
// twister JSON (signals.variationAsins), which a search tile does not expose.
export async function renderProductListsPanel(signals: ProductSignals): Promise<void> {
  if (!signals.asin) return;
  const asin = signals.asin;
  const marketplace = signals.marketplace;

  const section = addSection(t().listPanelHeading, t().listPanelIntro);
  const status = el("p", "note");

  // List picker: existing lists plus a "New list..." entry that reveals a name
  // input. Matches the tile menu's create-or-pick behavior.
  const { lists } = await sendToBackground<ProductListsResult>({ kind: "GET_PRODUCT_LISTS" });
  const NEW = "__new__";
  const picker = el("select") as HTMLSelectElement;
  for (const list of lists) {
    const opt = el("option") as HTMLOptionElement;
    opt.value = list.id;
    opt.textContent = `${list.name} (${list.items.length})`;
    picker.append(opt);
  }
  const newOpt = el("option") as HTMLOptionElement;
  newOpt.value = NEW;
  newOpt.textContent = t().listPanelNewOption;
  picker.append(newOpt);

  const nameInput = el("input", "note") as HTMLInputElement;
  nameInput.type = "text";
  nameInput.placeholder = t().tileMenuNewListPlaceholder;
  nameInput.maxLength = 60;
  const syncNameVisibility = () => {
    nameInput.style.display = picker.value === NEW || lists.length === 0 ? "" : "none";
  };
  picker.value = lists.length === 0 ? NEW : (lists[0]?.id ?? NEW);
  syncNameVisibility();
  picker.addEventListener("change", syncNameVisibility);

  // Resolve which list the add targets: an existing id, or a new-list name.
  const target = (): { listId?: string; newListName?: string; label: string } => {
    if (picker.value === NEW || lists.length === 0) {
      const name = nameInput.value.trim();
      return { newListName: name, label: name };
    }
    const list = lists.find((l) => l.id === picker.value);
    return { listId: picker.value, label: list?.name ?? "" };
  };

  const addBtn = el("button", "btn secondary");
  addBtn.textContent = t().listPanelAddProduct;
  addBtn.addEventListener("click", () => {
    const tgt = target();
    if (picker.value === NEW && !tgt.newListName) return;
    status.textContent = t().tileMenuWorking;
    void sendToBackground<ProductListsResult>({
      kind: "ADD_TO_PRODUCT_LIST",
      listId: tgt.listId,
      newListName: tgt.newListName,
      item: { asin, marketplace, title: signals.title ?? null, imageUrl: signals.imageUrl },
    }).then((res) => report(status, res, 1));
  });

  const row = el("div", "row");
  row.append(picker, addBtn);
  section.append(row, nameInput);

  // Add all variations: only when the twister reported more than just this ASIN.
  const variations = uniqueVariations(signals);
  if (variations.length > 1) {
    const varBtn = el("button", "btn secondary");
    varBtn.textContent = t().listPanelAddVariations(variations.length);
    varBtn.addEventListener("click", () => {
      const tgt = target();
      if (picker.value === NEW && !tgt.newListName) return;
      status.textContent = t().tileMenuWorking;
      void sendToBackground<ProductListsResult>({
        kind: "ADD_MANY_TO_PRODUCT_LIST",
        listId: tgt.listId,
        newListName: tgt.newListName,
        items: variations.map((v) => ({ asin: v, marketplace, title: null, imageUrl: null })),
      }).then((res) => report(status, res, res.added ?? 0));
    });
    section.append(varBtn);
  }

  section.append(status);
}

// The listing's own ASIN plus its twister siblings, deduped.
function uniqueVariations(signals: ProductSignals): string[] {
  const set = new Set<string>();
  if (signals.asin) set.add(signals.asin.toUpperCase());
  for (const v of signals.variationAsins) set.add(v.toUpperCase());
  return [...set];
}

function report(status: HTMLElement, res: ProductListsResult, count: number): void {
  if (res.atCap) {
    status.textContent = t().tileMenuListsCapped;
    return;
  }
  if (res.atItemCap) {
    status.textContent = t().tileMenuListFull;
    return;
  }
  const name = res.lists.find((l) => l.id === res.listId)?.name ?? "";
  if (count <= 0) {
    status.textContent = t().listPanelNothingNew;
    return;
  }
  status.textContent =
    count === 1 ? t().tileMenuAddedTo(name) : t().listPanelAddedCount(count, name);
}
