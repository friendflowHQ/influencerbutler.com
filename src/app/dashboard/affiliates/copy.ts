/**
 * Copy text to the clipboard and tell the user when it fails.
 *
 * Tries the async Clipboard API first, then a hidden-textarea fallback for
 * older browsers and insecure contexts. If both fail, shows a short toast
 * telling the person to select the text and press Ctrl+C (Windows) or Cmd+C
 * (Mac). Returns true on success so callers can flip their "Copied!" state.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return true;
  } catch {
    // fall through to the toast
  }
  showCopyFailedToast();
  return false;
}

function showCopyFailedToast() {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.setAttribute("role", "alert");
  el.textContent =
    "Couldn't copy automatically. Select the text and press Ctrl+C (Windows) or Cmd+C (Mac).";
  el.style.cssText =
    "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;max-width:90vw;" +
    "background:#0f172a;color:#fff;padding:12px 16px;border-radius:10px;font-size:14px;" +
    "box-shadow:0 8px 24px rgba(0,0,0,.25);";
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 6000);
}
