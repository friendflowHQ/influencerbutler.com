// MAIN-world hook, injected at document_start on product pages only.
//
// Amazon's video widget fetches its classified video list (creatorType per
// video) via XHR after the widget scrolls into view, and does not reliably
// leave that data in the DOM. This shim wraps fetch/XHR as a pure
// passthrough and, when a video-widget response goes by, republishes its
// text (and the request URL) to the isolated-world content script via a DOM
// CustomEvent. The URL lets the Deep Scan replay the endpoint with pagination
// and tag each payload's carousel source. Nothing is modified, blocked, or
// sent anywhere: it only listens.

(() => {
  const w = window as typeof window & { __ibExtHooked?: boolean };
  if (w.__ibExtHooked) return;
  w.__ibExtHooked = true;

  const URL_RE = /componentbuilder|vse|related-?videos|video/i;
  const looksLikeVideoData = (text: string) => text.includes('"creatorType"');

  const emit = (url: string, text: string) => {
    try {
      document.dispatchEvent(
        new CustomEvent("ib-ext-video-data", {
          detail: { url, body: text.slice(0, 2_000_000) },
        }),
      );
    } catch {
      // never let the shim surface an error on the page
    }
  };

  const originalFetch = window.fetch;
  window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    const result = originalFetch.apply(this as typeof globalThis, args);
    try {
      const input = args[0];
      const url =
        typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (URL_RE.test(url)) {
        result
          .then((response) => response.clone().text())
          .then((text) => {
            if (looksLikeVideoData(text)) emit(url, text);
          })
          .catch(() => undefined);
      }
    } catch {
      // passthrough regardless
    }
    return result;
  };

  const openOriginal = XMLHttpRequest.prototype.open;
  const sendOriginal = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest & { __ibUrl?: string },
    ...args: Parameters<XMLHttpRequest["open"]>
  ) {
    this.__ibUrl = String(args[1] ?? "");
    return openOriginal.apply(this, args as unknown as Parameters<XMLHttpRequest["open"]>);
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest & { __ibUrl?: string },
    ...args: Parameters<XMLHttpRequest["send"]>
  ) {
    try {
      if (URL_RE.test(this.__ibUrl ?? "")) {
        this.addEventListener("load", () => {
          try {
            const text = this.responseText;
            if (typeof text === "string" && looksLikeVideoData(text)) {
              emit(this.__ibUrl ?? "", text);
            }
          } catch {
            // responseType may not be text; ignore
          }
        });
      }
    } catch {
      // passthrough regardless
    }
    return sendOriginal.apply(this, args);
  };
})();
