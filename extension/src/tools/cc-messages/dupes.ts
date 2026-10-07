// Find the messages in a thread that merely repeat an earlier message from the
// same sender. Brands often send the identical blast twice (the CLOCKY thread
// shows the same "Good morning!" message back to back), which buries the real
// conversation. Pure so it is unit-tested; the DOM layer decides how to fold.

export type ThreadMessage = {
  sender: "brand" | "me" | "unknown";
  text: string;
};

// Messages shorter than this are never folded: "Thanks!" twice is a real reply.
const MIN_FOLD_CHARS = 24;

export function normalizeMessageText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Indexes of messages that repeat an earlier message from the same sender with
// nothing from the other side in between. A reply from the other sender breaks
// the run, so a brand re-sending its pitch AFTER the creator answered is kept.
export function findDuplicateIndexes(messages: ThreadMessage[]): number[] {
  const dupes: number[] = [];
  // Per sender, the texts seen since the other side last spoke.
  let run: { sender: ThreadMessage["sender"]; seen: Set<string> } | null = null;
  messages.forEach((message, index) => {
    if (message.sender === "unknown") {
      run = null;
      return;
    }
    if (!run || run.sender !== message.sender) {
      run = { sender: message.sender, seen: new Set() };
    }
    const key = normalizeMessageText(message.text);
    if (key.length < MIN_FOLD_CHARS) return;
    if (run.seen.has(key)) dupes.push(index);
    else run.seen.add(key);
  });
  return dupes;
}
