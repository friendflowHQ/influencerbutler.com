/**
 * Deterministic, zero-LLM transcript condenser. Recorded-call transcripts open
 * and close with pure banter (greetings, "can you hear me", screen-share
 * chatter, goodbyes) and are peppered with bare acknowledgements ("yeah",
 * "okay", "right"). Those lines carry no bug/feature signal but are sent to the
 * LLM twice (ai-notes + call-tickets) at up to 100k chars each, so they are pure
 * token waste.
 *
 * This strips ONLY high-confidence non-signal lines and never touches a line
 * that could carry a product problem or request: any line containing a signal
 * word is always kept. It runs before the extractors slice the transcript, so
 * both the notes summarizer and the ticket extractor see a smaller prompt. It
 * costs no tokens itself (plain string work). No em dashes in output.
 */

// Transcripts arrive as one "Speaker: text" turn per line (flattenSegments in
// recall.ts joins segments with "\n"). We drop whole lines only, so a line that
// mixes banter and substance is kept intact.

// Below this size, condensing is not worth the (tiny) risk of dropping a line;
// return the transcript untouched.
const FLOOR_CHARS = 2000;

// A dropped line must be reasonably short. A long line is unlikely to be pure
// banter and more likely to bury a real detail, so we keep it regardless.
const MAX_DROP_LEN = 140;

// Signal words: if a line contains any of these it is ALWAYS kept, even if it
// also looks like small talk. Deliberately broad, since a false keep only costs
// a few tokens while a false drop could lose a bug or request.
const SIGNAL_RE = new RegExp(
  [
    "bug",
    "error",
    "issue",
    "broken",
    "crash",
    "freeze",
    "frozen",
    "stuck",
    "fail",
    "glitch",
    "wrong",
    "problem",
    "doesn.?t\\s+work",
    "not\\s+work",
    "won.?t\\s+work",
    "can.?t",
    "cannot",
    "won.?t",
    "unable",
    "missing",
    "slow",
    "lag",
    "feature",
    "request",
    "wish",
    "would\\s+love",
    "would\\s+be\\s+(?:nice|great|helpful)",
    "could\\s+you\\s+add",
    "can\\s+you\\s+add",
    "please\\s+add",
    "support\\s+for",
    "link",
    "post",
    "campaign",
    "commission",
    "deal",
    "butler",
    "extension",
    "desktop",
    "login",
    "log\\s?in",
    "sign\\s?in",
    "password",
    "upload",
    "download",
    "export",
    "import",
    "setting",
    "account",
    "subscription",
    "billing",
    "refund",
    "charge",
    "amazon",
    "instagram",
    "facebook",
    "tiktok",
    "youtube",
    "walmart",
  ].join("|"),
  "i",
);

// Greeting / closing / logistics chatter. A line is droppable only if it matches
// this AND has no signal word AND is short.
const BANTER_RE = new RegExp(
  [
    "^(?:hey|hi|hello|good\\s+(?:morning|afternoon|evening)|howdy)\\b",
    "how\\s+are\\s+(?:you|ya|y.?all)",
    "how.?s\\s+it\\s+going",
    "nice\\s+to\\s+(?:meet|see)\\s+you",
    "good\\s+to\\s+(?:meet|see)\\s+you",
    "can\\s+you\\s+(?:hear|see)\\s+me",
    "you\\s+(?:hear|see)\\s+me",
    "am\\s+i\\s+coming\\s+through",
    "let\\s+me\\s+share\\s+my\\s+screen",
    "share\\s+my\\s+screen",
    "there\\s+(?:you|we)\\s+go",
    "thanks?\\s+for\\s+(?:meeting|hopping|joining|taking|your\\s+time)",
    "thank\\s+you\\s+so\\s+much",
    "nice\\s+(?:talking|chatting)",
    "have\\s+a\\s+(?:good|great)\\s+(?:one|day|rest)",
    "talk\\s+(?:to\\s+you\\s+)?soon",
    "take\\s+care",
    "bye\\b",
    "see\\s+(?:you|ya)\\b",
    "weather",
    "how.?s\\s+the\\s+(?:kids|family|weekend)",
  ].join("|"),
  "i",
);

// A line whose spoken text is ONLY acknowledgement filler. The whole text (minus
// punctuation) must be filler tokens; a single content word keeps the line.
const FILLER_WORDS = new Set([
  "yeah", "yep", "yup", "yes", "no", "nope", "okay", "ok", "kay", "right",
  "mhm", "mm", "hmm", "uh", "um", "so", "well", "like", "cool", "nice",
  "awesome", "great", "sure", "totally", "exactly", "gotcha", "got", "it",
  "for", "sure", "of", "course", "sounds", "good", "no", "worries", "perfect",
  "absolutely", "definitely", "amazing", "love", "lol", "haha", "oh", "wow",
  "and", "you", "know", "i", "mean", "the", "a", "to",
]);

/** Extract the spoken text after a leading "Speaker: " label, if present. */
function spokenText(line: string): string {
  const idx = line.indexOf(": ");
  // Only treat the prefix as a speaker label when it is short and label-like
  // (no sentence punctuation before the colon), so we do not mistake a real
  // sentence's colon for a speaker delimiter.
  if (idx > 0 && idx <= 40 && !/[.!?]/.test(line.slice(0, idx))) {
    return line.slice(idx + 2);
  }
  return line;
}

/** True when the spoken text is nothing but acknowledgement filler. */
function isFillerOnly(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true; // punctuation-only line
  if (words.length > 6) return false; // too long to be a bare ack
  return words.every((w) => FILLER_WORDS.has(w));
}

export type CondenseResult = {
  text: string;
  removedLines: number;
  originalChars: number;
  keptChars: number;
};

/**
 * Remove high-confidence banter/filler lines from a transcript. Conservative:
 * keeps any line with a signal word, any long line, and anything it is unsure
 * about. Returns the condensed text plus before/after sizes for logging.
 */
export function condenseTranscript(transcript: string): CondenseResult {
  const original = transcript || "";
  const originalChars = original.length;
  if (originalChars < FLOOR_CHARS) {
    return { text: original, removedLines: 0, originalChars, keptChars: originalChars };
  }

  const lines = original.split(/\r?\n/);
  const kept: string[] = [];
  let removedLines = 0;

  for (const line of lines) {
    if (line.trim() === "") { kept.push(line); continue; }
    const text = spokenText(line).trim();

    // Never drop a line that carries product/problem/request signal.
    if (SIGNAL_RE.test(text)) { kept.push(line); continue; }

    const droppable =
      isFillerOnly(text) ||
      (text.length <= MAX_DROP_LEN && BANTER_RE.test(text));

    if (droppable) { removedLines++; continue; }
    kept.push(line);
  }

  // Collapse the runs of blank lines a removal can leave behind.
  const text = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, removedLines, originalChars, keptChars: text.length };
}
