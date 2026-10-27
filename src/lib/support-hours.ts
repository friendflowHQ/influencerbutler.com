/**
 * The support team's staffed hours, shown wherever a customer is about to
 * reach a human (dashboard chat bubble, contact page, site footer). One copy
 * so the surfaces never drift; public/index.html cannot import this and
 * carries the same text by hand.
 */

export const SUPPORT_HOURS = "Mon-Fri 6 AM-11 PM ET, weekends 10 AM-6 PM ET.";

export const SUPPORT_HOURS_LINE = `Support hours: ${SUPPORT_HOURS}`;
