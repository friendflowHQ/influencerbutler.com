// Why routing handed back the plain tagged Amazon url instead of the provider's
// own link, in the cases the user should be told about. The link is unaffected:
// the plain tagged url is a working affiliate link and is still copied. Only the
// silence was the bug, so this is a notice, never an error the caller must
// handle.
//
// An adapter raises one of these instead of quietly returning the tagged url;
// routing.buildAffiliateLink catches it, falls back exactly as it does for any
// other provider failure, and threads the reason out to the UI.

export type LinkNotice =
  // The Influencer Butler branded-link provider is selected but the extension
  // has no license key, so nothing can be minted. Signing in is the only
  // blocker: minting is free on every plan.
  "signInRequired";

export class LinkNoticeError extends Error {
  readonly notice: LinkNotice;

  constructor(notice: LinkNotice, message: string) {
    super(message);
    this.name = "LinkNoticeError";
    this.notice = notice;
  }
}

// The notice carried by a thrown value, if any. Anything else is an ordinary
// failure with nothing extra to say to the user.
export function noticeOf(error: unknown): LinkNotice | undefined {
  return error instanceof LinkNoticeError ? error.notice : undefined;
}
