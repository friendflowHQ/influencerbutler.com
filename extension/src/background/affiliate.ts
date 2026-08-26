import { patchState } from "../storage/store";

// Captured affiliate referral. The site-referral content script reads the code
// from the ib_aff_src cookie / ?code= param on an influencerbutler.com page and
// sends it here; we keep it first-touch in storage.local so a later license
// activation (see background/auth.ts signIn) can hand it to the server and
// credit the affiliate, even after the 30-day web cookie is gone.

// Branded affiliate codes are short alphanumeric slugs. Reject anything else so
// a junk value from a page can never be stored.
const CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function captureAffiliateReferral(
  rawCode: string,
  source: string | null,
): Promise<void> {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code || !CODE_RE.test(code)) return;

  await patchState((state) => {
    // First-touch: the first affiliate a user encountered wins. Never overwrite.
    if (state.affiliate) return;
    state.affiliate = { code, capturedAt: Date.now(), source };
  });
}
