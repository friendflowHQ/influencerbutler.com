# "Bought in past month" localized-phrase fixtures

The bought-badge extractor (`../../bought-badge.ts`) reads the count
structurally from Amazon's social-proofing container, so the common "N+" /
"NK+" shape works on every marketplace without a translation table. The
non-English **phrase** fallbacks (used only when the container is absent) are
marked `UNVERIFIED` in `bought-badge.ts` because they could not be confirmed
from the build environment (Amazon blocks automated fetches: 500/503 on every
non-.com marketplace).

To lock a marketplace's phrasing before claiming it publicly:

1. On a real `amazon.<tld>` product page that shows the badge, save the page
   HTML (or just copy the exact badge text) into `<tld>.html` here, e.g.
   `de.html`, `fr.html`, `es.html`, `it.html`, `co.jp.html`, `com.mx.html`,
   `com.br.html`.
2. Confirm the `UNVERIFIED` regex for that locale in `bought-badge.ts` actually
   matches the real text; adjust the phrase if not, and drop the `UNVERIFIED`
   comment once confirmed.
3. Add a case to `../../bought-badge.test.ts` asserting the count parses from
   the saved text.

Until a locale is confirmed this way, treat its badge-text reading as
best-effort: a wrong phrase yields `null` (never a wrong number), and the
`N+` structural path still covers the normal case.
