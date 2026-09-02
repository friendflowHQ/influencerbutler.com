import { addSection, el } from "../../ui/components";
import { t } from "../../i18n";
import { sendToBackground, type WatchlistResult } from "../../shared/messages";
import { WATCHLIST_CAP } from "../../storage/schema";
import type { ProductSignals } from "../../amazon/product-signals";

// Product-page "Watch this product" toggle. Adds the ASIN to the watchlist with
// all change conditions on by default (restock, open slot, price drop); the
// popup lets the user narrow which alerts they want. The background poller does
// the checking, so this panel only flips membership.
export async function renderWatchButton(signals: ProductSignals): Promise<void> {
  if (!signals.asin) return;
  const asin = signals.asin;
  const marketplace = signals.marketplace;

  const section = addSection(t().watchlist, t().watchlistIntro);
  const button = el("button", "btn secondary");
  const status = el("p", "note");
  section.append(button, status);

  let watched = await sendToBackground<boolean>({ kind: "IS_WATCHED", asin, marketplace });
  const paint = () => {
    button.textContent = watched ? t().watchRemove : t().watchAdd;
  };
  paint();

  button.addEventListener("click", () => {
    button.disabled = true;
    const done = (res: WatchlistResult) => {
      button.disabled = false;
      if (!watched && res.atCap) {
        status.textContent = t().watchAtCap(WATCHLIST_CAP);
        return;
      }
      watched = !watched;
      paint();
      status.textContent = watched ? t().watchAdded : t().watchRemoved;
    };
    if (watched) {
      void sendToBackground<WatchlistResult>({
        kind: "REMOVE_FROM_WATCHLIST",
        asin,
        marketplace,
      }).then(done);
    } else {
      void sendToBackground<WatchlistResult>({
        kind: "ADD_TO_WATCHLIST",
        item: { asin, marketplace, title: signals.title ?? null, imageUrl: signals.imageUrl },
      }).then(done);
    }
  });
}
