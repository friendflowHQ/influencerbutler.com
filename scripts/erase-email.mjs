/**
 * Summary: Privacy erasure for ONE email address. Finds every trace of the
 *   address across Supabase (auth user + every table with an email-like column,
 *   plus rows linked by user_id), Resend (audience contact) and Lemon Squeezy
 *   (cancel live subscriptions, archive and scrub the customer).
 *
 *   DRY RUN unless you pass --apply. A dry run only READS and prints what it
 *   would delete, so run it first and review the table list.
 *
 *   Supabase tables are discovered from PostgREST's schema (/rest/v1/), so it
 *   also catches tables that exist in production but not in supabase/migrations
 *   (schema drift). Columns scanned: names containing "email" or "recipient"
 *   (text types) plus "user_id" / "referrer_id" style columns for the auth user.
 *   JSON payload columns (e.g. webhook_events.payload) are NOT searched; the
 *   script lists tables that have them so you can check by hand.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_URL="https://xxxx.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="..."
 *   $env:LEMONSQUEEZY_API_KEY="..."        # optional, skips Lemon Squeezy if unset
 *   $env:RESEND_API_KEY="..."              # optional, skips Resend if unset
 *   $env:RESEND_AUDIENCE_ID="..."          # optional, needed for Resend contact removal
 *   node scripts/erase-email.mjs --email=kej5c@uvawise.edu            # dry run
 *   node scripts/erase-email.mjs --email=kej5c@uvawise.edu --apply     # for real
 *
 * Usage (Mac Terminal):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... LEMONSQUEEZY_API_KEY=... \
 *     node scripts/erase-email.mjs --email=kej5c@uvawise.edu
 *
 * Flags:
 *   --email=<addr>      Required. The address to erase.
 *   --apply             Actually delete. Without it nothing is changed.
 *   --skip=a,b          Table names to leave alone (e.g. keep tax records).
 *   --no-suppression    Also delete the email_suppressions row (default KEEPS a
 *                       suppression row so the address cannot be re-mailed by a
 *                       later import; see the note printed in the report).
 *
 * Dependencies: Node 18+ (global fetch). No npm installs.
 */

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name) => args.includes(`--${name}`);

const EMAIL = (flag("email") ?? "").trim().toLowerCase();
const APPLY = has("apply");
const SKIP = new Set((flag("skip") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const KEEP_SUPPRESSION = !has("no-suppression");

if (!EMAIL || !EMAIL.includes("@")) {
  console.error("Missing --email=<address>");
  process.exit(1);
}

const SB_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const LS_KEY = process.env.LEMONSQUEEZY_API_KEY || "";
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const RESEND_AUDIENCE = process.env.RESEND_AUDIENCE_ID || "";

if (!SB_URL || !SB_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

console.log(`${APPLY ? "APPLY MODE (deleting)" : "DRY RUN (nothing is changed)"} for ${EMAIL}\n`);

const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
// Escape LIKE wildcards so ilike behaves as a case-insensitive exact match.
const likeEsc = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const enc = encodeURIComponent;

async function sb(path, init = {}) {
  const res = await fetch(`${SB_URL}${path}`, { ...init, headers: { ...sbHeaders, ...(init.headers ?? {}) } });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}

/* ---------------- 1. Supabase auth user(s) ---------------- */

async function findAuthUsers() {
  const found = [];
  for (let page = 1; page < 200; page++) {
    const r = await sb(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    if (!r.ok) throw new Error(`auth list failed: ${r.status} ${r.text}`);
    const users = r.json?.users ?? [];
    for (const u of users) if ((u.email ?? "").toLowerCase() === EMAIL) found.push(u.id);
    if (users.length < 1000) break;
  }
  return found;
}

/* ---------------- 2. Discover tables + columns ---------------- */

async function discoverColumns() {
  const r = await sb("/rest/v1/", { headers: { Accept: "application/openapi+json" } });
  if (!r.ok || !r.json?.definitions) throw new Error(`schema discovery failed: ${r.status}`);
  const emailCols = []; // { table, column }
  const userCols = []; // { table, column }
  const jsonTables = [];
  for (const [table, def] of Object.entries(r.json.definitions)) {
    for (const [column, spec] of Object.entries(def.properties ?? {})) {
      const isText = spec.type === "string" && !spec.format?.includes("uuid") && !spec.format?.includes("timestamp") && spec.format !== "date";
      if (isText && /(email|recipient)/i.test(column) && !/_(sent|at|count)$/i.test(column) && !/^(email_confirm)/i.test(column)) {
        emailCols.push({ table, column });
      }
      if (/^(user_id|referrer_user_id|affiliate_user_id|owner_id)$/i.test(column)) {
        userCols.push({ table, column });
      }
      if (/json/i.test(spec.format ?? "")) jsonTables.push(`${table}.${column}`);
    }
  }
  return { emailCols, userCols, jsonTables };
}

async function exactCount(table, filter) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}&select=*`, {
    method: "HEAD",
    headers: { ...sbHeaders, Prefer: "count=exact" },
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const cr = res.headers.get("content-range") ?? "";
  const n = Number(cr.split("/")[1]);
  return { rows: Number.isFinite(n) ? n : 0 };
}

async function deleteRows(table, filter) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
  });
  return res.ok ? null : `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
}

/* ---------------- 3. Supabase pass ---------------- */

const report = [];

async function supabasePass() {
  const userIds = await findAuthUsers();
  console.log(`Auth users matching: ${userIds.length ? userIds.join(", ") : "none"}`);

  const { emailCols, userCols, jsonTables } = await discoverColumns();
  const targets = [];

  for (const { table, column } of emailCols) {
    if (SKIP.has(table)) continue;
    if (table === "email_suppressions" && KEEP_SUPPRESSION) continue;
    targets.push({ table, column, filter: `${column}=ilike.${enc(likeEsc(EMAIL))}`, by: "email" });
  }
  for (const { table, column } of userCols) {
    if (SKIP.has(table) || !userIds.length) continue;
    targets.push({ table, column, filter: `${column}=in.(${userIds.join(",")})`, by: "user id" });
  }

  for (const t of targets) {
    const c = await exactCount(t.table, t.filter);
    if (c.error) { report.push(`  ? ${t.table}.${t.column} (${t.by}): ${c.error}`); continue; }
    if (!c.rows) continue;
    let status = "would delete";
    if (APPLY) {
      const err = await deleteRows(t.table, t.filter);
      status = err ? `FAILED: ${err}` : "deleted";
    }
    report.push(`  ${t.table}.${t.column} (${t.by}): ${c.rows} row(s) ${status}`);
  }

  // Auth user last, so FK-cascades from profiles etc. have already been handled above.
  for (const id of userIds) {
    if (!APPLY) { report.push(`  auth.users ${id}: would delete`); continue; }
    const r = await sb(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
    report.push(`  auth.users ${id}: ${r.ok ? "deleted" : `FAILED ${r.status} ${r.text.slice(0, 120)}`}`);
  }

  console.log("\nSupabase:");
  console.log(report.length ? report.join("\n") : "  nothing found");
  if (KEEP_SUPPRESSION) {
    console.log("  (email_suppressions row KEPT on purpose so this address is never re-mailed; pass --no-suppression to delete it too)");
  }
  console.log("\nJSON columns this script does NOT search (check by hand for the address):");
  console.log("  " + (jsonTables.join(", ") || "none"));
}

/* ---------------- 4. Resend ---------------- */

async function resendPass() {
  console.log("\nResend:");
  if (!RESEND_KEY || !RESEND_AUDIENCE) {
    console.log("  skipped (set RESEND_API_KEY and RESEND_AUDIENCE_ID to remove the audience contact)");
    return;
  }
  const url = `https://api.resend.com/audiences/${RESEND_AUDIENCE}/contacts/${enc(EMAIL)}`;
  const headers = { Authorization: `Bearer ${RESEND_KEY}` };
  const get = await fetch(url, { headers });
  if (get.status === 404) { console.log("  no audience contact"); return; }
  if (!get.ok) { console.log(`  lookup failed: HTTP ${get.status}`); return; }
  if (!APPLY) { console.log("  audience contact found: would delete"); return; }
  const del = await fetch(url, { method: "DELETE", headers });
  console.log(`  audience contact: ${del.ok ? "deleted" : `FAILED HTTP ${del.status}`}`);
  console.log("  NOTE: Resend keeps sent-email logs on its side; ask Resend support to purge them if needed.");
}

/* ---------------- 5. Lemon Squeezy ---------------- */

const lsHeaders = {
  Accept: "application/vnd.api+json",
  "Content-Type": "application/vnd.api+json",
  Authorization: `Bearer ${LS_KEY}`,
};

async function ls(path, init = {}) {
  const res = await fetch(`https://api.lemonsqueezy.com${path}`, { ...init, headers: { ...lsHeaders, ...(init.headers ?? {}) } });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}

async function lemonPass() {
  console.log("\nLemon Squeezy:");
  if (!LS_KEY) { console.log("  skipped (set LEMONSQUEEZY_API_KEY)"); return; }

  const customers = await ls(`/v1/customers?filter[email]=${enc(EMAIL)}&page[size]=50`);
  if (!customers.ok) { console.log(`  customer lookup failed: HTTP ${customers.status}`); return; }
  const list = customers.json?.data ?? [];
  console.log(`  customers: ${list.length}`);

  const subs = await ls(`/v1/subscriptions?filter[user_email]=${enc(EMAIL)}&page[size]=50`);
  const subList = subs.ok ? subs.json?.data ?? [] : [];
  const orders = await ls(`/v1/orders?filter[user_email]=${enc(EMAIL)}&page[size]=50`);
  const orderList = orders.ok ? orders.json?.data ?? [] : [];
  console.log(`  subscriptions: ${subList.length}, orders: ${orderList.length}`);

  // 1. Cancel anything still live so nothing keeps billing.
  for (const s of subList) {
    const st = s.attributes?.status;
    if (["cancelled", "expired"].includes(st)) continue;
    if (!APPLY) { console.log(`  subscription ${s.id} (${st}): would cancel`); continue; }
    const r = await ls(`/v1/subscriptions/${s.id}`, { method: "DELETE" });
    console.log(`  subscription ${s.id}: ${r.ok ? "cancelled" : `FAILED HTTP ${r.status}`}`);
  }

  // 2. Archive the customer and scrub the editable PII. The API cannot hard-delete.
  for (const c of list) {
    if (!APPLY) { console.log(`  customer ${c.id}: would archive + scrub name/email/location`); continue; }
    const scrub = {
      data: {
        type: "customers",
        id: String(c.id),
        attributes: {
          name: "Erased",
          email: `erased-${c.id}@erased.invalid`,
          city: null,
          region: null,
          country: null,
          status: "archived",
        },
      },
    };
    let r = await ls(`/v1/customers/${c.id}`, { method: "PATCH", body: JSON.stringify(scrub) });
    if (!r.ok) {
      // Some accounts reject the placeholder email; at least archive.
      delete scrub.data.attributes.email;
      r = await ls(`/v1/customers/${c.id}`, { method: "PATCH", body: JSON.stringify(scrub) });
      console.log(`  customer ${c.id}: ${r.ok ? "archived + name scrubbed (email edit rejected)" : `FAILED HTTP ${r.status}`}`);
    } else {
      console.log(`  customer ${c.id}: archived + scrubbed`);
    }
  }

  console.log(
    "  NOTE: Lemon Squeezy has no API to hard-delete a customer or edit past orders/invoices.\n" +
      "  For full erasure, email Lemon Squeezy support (they act as merchant of record and may\n" +
      "  retain order/tax records by law) and ask them to delete the customer data for this address.",
  );
}

/* ---------------- run ---------------- */

try {
  await supabasePass();
  await resendPass();
  await lemonPass();
  console.log(APPLY ? "\nDone." : "\nDry run complete. Re-run with --apply to delete.");
} catch (e) {
  console.error("\nAborted:", e instanceof Error ? e.message : e);
  process.exit(1);
}
