import { warn } from "./log";

// Every tool entrypoint runs through guard(). A throw disables that tool for
// the page instead of surfacing on amazon.com: the extension must never
// visibly break the site.
const disabled = new Set<string>();

export function guard(toolId: string, fn: () => void | Promise<void>): void {
  if (disabled.has(toolId)) return;
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.catch((error) => {
        disabled.add(toolId);
        warn(toolId, "disabled for this page after async error", error);
      });
    }
  } catch (error) {
    disabled.add(toolId);
    warn(toolId, "disabled for this page after error", error);
  }
}

export function isDisabled(toolId: string): boolean {
  return disabled.has(toolId);
}
