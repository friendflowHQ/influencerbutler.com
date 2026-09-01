// Read from and write into the Creator Connections message composer. Amazon
// ships the composer as a React-controlled field, so a naive `el.value = text`
// is silently reverted on the next render: React holds the value in its own
// state and only reconciles through the field's native setter + an input event.
// This is the one genuinely new mechanism in the Message Templates tool (nothing
// else in the extension writes into a CC input), so it is isolated here and
// unit-tested against both the textarea and contenteditable cases.

// Read the current composer text, so "Save as template" captures what the user
// has typed. Empty string when the composer is empty or unreadable.
export function readComposer(composer: HTMLElement): string {
  if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
    return composer.value;
  }
  return composer.textContent ?? "";
}

// Insert `text` into the composer at the caret (replacing any selection), or
// append when there is no caret. Returns false when the field could not be
// written, so the caller can surface a "could not insert" message instead of
// silently doing nothing. Focuses the composer afterward so the user can keep
// typing / edit the inserted text.
export function insertIntoComposer(composer: HTMLElement, text: string): boolean {
  if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
    const current = composer.value;
    const start = composer.selectionStart ?? current.length;
    const end = composer.selectionEnd ?? current.length;
    const next = current.slice(0, start) + text + current.slice(end);
    const ok = setNativeValue(composer, next);
    if (!ok) return false;
    const caret = start + text.length;
    try {
      composer.focus();
      composer.setSelectionRange(caret, caret);
    } catch {
      // some inputs (e.g. type=email) reject setSelectionRange; harmless here
    }
    return true;
  }

  // Contenteditable fallback: execCommand("insertText") keeps the editor's own
  // model in sync (it fires the same beforeinput/input the editor listens for),
  // where a manual textContent write would not.
  try {
    composer.focus();
    return document.execCommand("insertText", false, text);
  } catch {
    return false;
  }
}

// Set a React-controlled field's value through the prototype's native setter,
// then dispatch the `input` event React listens for so its onChange fires and
// the new value survives the next render. Returns false if the native setter is
// unavailable (a non-standard field), so the caller can fall back or report.
function setNativeValue(field: HTMLTextAreaElement | HTMLInputElement, value: string): boolean {
  const proto = Object.getPrototypeOf(field) as object;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (!descriptor || typeof descriptor.set !== "function") return false;
  descriptor.set.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
