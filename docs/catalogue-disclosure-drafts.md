# Shared product catalogue: disclosure drafts (DRAFT - lawyer review before publish)

These are the four disclosure updates required before the opt-in "shared product
catalogue" contribution can go live in a public extension build. They are drafts
for legal review and are deliberately kept OUT of the live policy files so
nothing publishes before sign-off. Once approved, apply each block at the noted
location.

Background for the reviewer: signed-in creators who explicitly turn ON a
"Contribute to the shared product catalogue" toggle (OFF by default) send
**product facts** the extension already reads on the Amazon pages they visit:
ASIN, price, best-seller rank (BSR), the "bought in past month" figure, category,
and brand. These are facts about Amazon's catalogue, not personal data. They are
pooled, de-identified, into a shared database so every user sees real demand and
price/rank history (the data Amazon stopped publishing). The contributor's user
id is retained server-side for audit/abuse control only and is never exposed on
read. This is a new USE (pooling for cross-user benefit) of mostly-already-
collected data, plus one genuinely new field sent to our servers (BSR).

Repo copy rule: no em dashes anywhere (use ":" for label separators, "-" for
prose breaks). Drafts below follow it.

---

## 1. Extension privacy policy

**File:** `src/app/extension/privacy/page.tsx` (the `SECTIONS` array).

### 1a. New section (insert after "What is transmitted to Influencer Butler, and when")

> **Heading:** Contributing to the shared product catalogue (optional, off by default)
>
> Influencer Butler offers an optional shared product catalogue so creators can
> see real demand and price history for Amazon products, including the sales
> signals Amazon no longer publishes. Contributing to it is off by default. You
> turn it on with the "Contribute to the shared product catalogue" toggle, and
> you can turn it off again at any time.
>
> When contribution is on, and only then, the extension includes these product
> facts from the Amazon product pages you already view in the sync described
> above: ASIN, marketplace, price, best-seller rank, the "bought in past month"
> figure, category, and brand. These are facts about the product, not about you.
> We pool them, de-identified, so every Influencer Butler user can see pooled
> price history, rank history, and an estimated monthly-sales figure. We keep a
> record of which account contributed an observation for security and abuse
> prevention only, and that record is never shown to other users or included in
> any catalogue we display or share.
>
> We never pool personal data through this feature: not your orders, not your
> storefront, not your earnings, not your browsing outside Amazon product pages.
> If contribution is off, none of the product facts above are transmitted.

### 1b. Amend the "What the extension never does" bullet

Current:
> "It does not sell your data, and it does not share your data with anyone other
> than the parties named in this policy."

Replace with:
> "It does not sell your data. It does not share your personal data with anyone
> other than the parties named in this policy. If you opt in to the shared
> product catalogue, it contributes de-identified product facts (never personal
> data) as described in 'Contributing to the shared product catalogue' above."

### 1c. Amend "Parties your data may be shared with"

Add a sentence:
> "If you opt in to the shared product catalogue, the de-identified product facts
> you contribute become part of a catalogue visible to other Influencer Butler
> users. No personal data is included, and contributors are never identified to
> other users."

---

## 2. Website / desktop privacy policy

**File:** `public/legal/privacy.html`

### 2a. The "exhaustive" claim (currently around section 2)

The policy states the "Sent to our servers" list is exhaustive. Either soften the
exhaustiveness claim or add the catalogue contribution to the list. Suggested
added bullet under "Sent to our servers", clearly conditioned on opt-in:

> "If you use the Chrome extension and turn on the optional shared product
> catalogue (off by default), product facts the extension reads on Amazon product
> pages you visit: ASIN, price, best-seller rank, 'bought in past month',
> category, and brand. These are product facts, not personal data, and are pooled
> de-identified for the shared catalogue feature."

### 2b. Add aggregate-use language (under "How we use information")

> "Where you opt in to the shared product catalogue, we aggregate the de-
> identified product facts you contribute with those contributed by others to
> provide pooled market data (price history, rank history, and estimated sales)
> to all users of that feature. We do not use this to build a profile of you, and
> we do not identify contributors to other users."

---

## 3. Terms of Service or EULA: contribution license grant

**File:** `public/legal/terms.html` (preferred) or `public/legal/eula.html`.
Neither currently contains any grant of rights in user-contributed data. Add a
narrow, product-facts-only grant. Suggested clause:

> **Shared product catalogue.** Influencer Butler offers an optional shared
> product catalogue. If you enable it, you grant Influencer Butler
> (The Social Media Posse LLC) a worldwide, royalty-free, perpetual license to
> use, reproduce, aggregate, and display the de-identified product facts you
> contribute (such as ASIN, price, best-seller rank, category, and publicly shown
> demand figures) to operate and improve the shared catalogue and related
> features for all users. This license covers product facts only. It does not
> grant Influencer Butler any rights in your personal data, your account, your
> orders, your storefront, or your earnings, which remain governed by the Privacy
> Policy. You may stop contributing at any time; facts already aggregated into the
> catalogue may remain in de-identified pooled form.

Reviewer note: confirm the perpetual/irrevocable framing for already-pooled
de-identified facts is acceptable, and align with any data-deletion commitments
in the Privacy Policy (section 7 retention).

---

## 4. Chrome Web Store data-use declaration

**File:** `docs/chrome-web-store-listing.md` (the store listing pack), and the
matching fields in the Web Store developer dashboard at publish time.

Context: the 2026-07-09 takedown was for a privacy policy that "did not
comprehensively disclose what the extension collects, uses, and shares." The
current certification on file states data "is not used or transferred for
purposes unrelated to the extension's single purpose." A shared catalogue must be
squared with that single-purpose statement, so update BOTH the collected-data
list and the single-purpose framing.

### 4a. Amend the "Website content" collected list

Add best-seller rank and the pooled-contribution purpose:

> "product data (ASIN, title, price, best-seller rank, 'bought in past month',
> category, brand, video counts, opportunity-criteria results, storefront issue
> types). Product data is transmitted to influencerbutler.com only when the user
> is signed in and sync is on. Best-seller rank and 'bought in past month', and
> pooling of product data into the shared catalogue, are sent only when the user
> additionally opts in to the shared product catalogue (off by default)."

### 4b. Reconcile the single-purpose statement

Frame the catalogue as part of the same single purpose (product insight while you
browse), not a new purpose:

> "Single purpose: give Amazon Influencers product and campaign insights on the
> Amazon pages they are viewing. The optional shared product catalogue serves the
> same purpose: it pools de-identified product facts contributed by opted-in users
> so those same insights (real demand, price history, estimated sales) are
> available even where Amazon no longer shows them. No personal data is pooled or
> sold."

### 4c. Keep the certification honest

The "not sold to third parties / not transferred for unrelated purposes"
certification can stand as-is: the catalogue is first-party, not sold, and serves
the declared single purpose. Confirm this reading with the reviewer.

---

## Apply-order checklist (post-approval)

1. Lawyer approves wording for all four.
2. Apply 1 (extension privacy page), 2 (website privacy), 3 (ToS/EULA grant).
3. Update 4 in the listing pack AND the Web Store dashboard fields.
4. Only then enable the contribution UI in a public build and submit for review
   (Phase E). The toggle already ships off by default, so an early build is safe,
   but do not promote or default-on contribution before these publish.
