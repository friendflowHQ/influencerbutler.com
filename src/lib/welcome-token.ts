// Shared constants + helpers for the welcome-token flow that lets the post-
// purchase /welcome page identify the buyer without requiring authentication.
//
// Flow:
//   1. Before redirecting to Lemon Squeezy, /api/checkout(/guest) generates a
//      UUID, sets it as the WELCOME_TOKEN_COOKIE on the response, and passes
//      it as `custom_data.welcome_token` on the LS checkout.
//   2. The LS `order_created` webhook captures custom_data.welcome_token and
//      stores it on orders.welcome_token (see migration 20260421).
//   3. The /welcome page reads the cookie and calls /api/welcome/license to
//      fetch the license key + order status keyed by the token.
//
// The token is single-purchase-scoped, time-windowed (orders older than
// WELCOME_TOKEN_MAX_ORDER_AGE_MS are ignored on lookup), and the cookie is
// HttpOnly so JS can't exfiltrate it. The /api/welcome/license endpoint is the
// only place the token is exchanged for license data.

import { randomUUID } from "node:crypto";

export const WELCOME_TOKEN_COOKIE = "ib_welcome_token";

/** Cookie lifetime — long enough to outlive the LS checkout round-trip plus
 *  a few minutes of webhook latency, but short enough that a stale cookie on
 *  a shared device can't keep pulling license keys forever. */
export const WELCOME_TOKEN_COOKIE_MAX_AGE_SECONDS = 60 * 60; // 1 hour

/** How fresh an order must be (orders.created_at) for /api/welcome/license to
 *  surface its license key against a token. Defends against leaked cookies
 *  being replayed long after the purchase. */
export const WELCOME_TOKEN_MAX_ORDER_AGE_MS = 60 * 60 * 1000; // 1 hour

export function generateWelcomeToken(): string {
  return randomUUID();
}
