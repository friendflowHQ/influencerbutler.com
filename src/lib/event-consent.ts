/**
 * Shared recording-consent notice shown wherever someone registers for or views
 * a recorded event (the dashboard events list, the public /events/<id> share
 * page, and the confirmation email), so attendees know the call is recorded and
 * may be shared publicly, and consent by registering and joining. Kept in its
 * own tiny, dependency-free module so both client and server code can import it.
 * No em dashes (repo style).
 */
export const RECORDING_CONSENT_NOTICE =
  "This session is recorded. The replay and clips may be shared publicly, including on our website, YouTube, and social media. By registering and joining, you consent to being recorded and to that use.";
