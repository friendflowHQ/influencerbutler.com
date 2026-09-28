import { FLAGS_BASE, FLAGS_STALE_MS } from "../shared/constants";
import { getFlags, setFlags, sanitizeFlags } from "../flags/cache";
import { log } from "../shared/log";

// Refreshes the remote operational flags (kill switch + selector overrides).
// Sends If-None-Match with the cached version so an unchanged payload costs a
// 304 and no re-parse. Runs from the background worker on the sync alarm, but
// only actually hits the network once past the stale window, so the frequent
// alarm does not become a frequent fetch. Failures leave the last-known flags
// in place: a network blip must never spontaneously re-enable a tool the site
// deliberately turned off.

export async function refreshFlags(): Promise<void> {
  const existing = await getFlags();
  if (existing && Date.now() - existing.fetchedAt < FLAGS_STALE_MS) return;

  try {
    const headers: Record<string, string> = {};
    if (existing?.version) headers["If-None-Match"] = `"flags-${existing.version}"`;

    const res = await fetch(FLAGS_BASE, { headers });
    if (res.status === 304) {
      // Unchanged: bump the freshness stamp so we do not re-check for a while.
      if (existing) await setFlags({ ...existing, fetchedAt: Date.now() });
      return;
    }
    if (!res.ok) return;

    const clean = sanitizeFlags(await res.json());
    await setFlags({ ...clean, fetchedAt: Date.now() });
    log("flags", `refreshed -> ${clean.version || "(empty)"}`);
  } catch (error) {
    log("flags", "refresh failed", error);
  }
}
