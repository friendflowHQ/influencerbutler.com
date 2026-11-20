// "Pause on this site": hostnames where the user turned every overlay off.
// Stored without a leading "www." so www.amazon.com and amazon.com match.

export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function isHostPaused(list: readonly string[] | undefined, hostname: string): boolean {
  if (!list || list.length === 0) return false;
  const host = normalizeHost(hostname);
  return list.some((h) => normalizeHost(h) === host);
}

export function withHostPaused(list: readonly string[] | undefined, hostname: string, paused: boolean): string[] {
  const host = normalizeHost(hostname);
  const rest = (list ?? []).filter((h) => normalizeHost(h) !== host);
  return paused ? [...rest, host] : rest;
}
