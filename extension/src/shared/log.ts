// Namespaced logger. Quiet unless the debug flag is set in storage; never
// throws, because logging must not be able to take a tool down.
let debugEnabled = false;

export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

export function log(ns: string, ...args: unknown[]): void {
  try {
    if (debugEnabled) console.log(`[ib:${ns}]`, ...args);
  } catch {
    // ignore
  }
}

export function warn(ns: string, ...args: unknown[]): void {
  try {
    console.warn(`[ib:${ns}]`, ...args);
  } catch {
    // ignore
  }
}
