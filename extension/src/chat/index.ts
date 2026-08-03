/**
 * AI Assistant full-tab page. A grounded help chat that reuses the hosted AI
 * concierge (POST /api/ai-concierge/chat, routed through the background worker
 * with the license-key bearer). Text only here; live voice lives on the website.
 * Built from the shared el() primitive + options.css, like the Deals page.
 */
import { el } from "../ui/components";
import { sendToBackground } from "../shared/messages";
import type { AiChatResult, AiChatTurn } from "../shared/messages";

const SUGGESTIONS = [
  "How do I set up the Chrome extension?",
  "How do I connect my Amazon Creator API?",
  "How does Daily Deals posting work?",
];

function main(): void {
  const root = document.getElementById("root");
  if (!root) return;

  const messages: AiChatTurn[] = [];
  let sending = false;

  const intro = el(
    "p",
    "chat-intro",
    "Ask anything about setting up and using Influencer Butler. Answers come from our help guides.",
  );
  const log = el("div", "chat-log");

  const suggestWrap = el("div", "chat-suggest");
  for (const s of SUGGESTIONS) {
    const chip = el("button", "chat-chip", s);
    chip.onclick = () => void send(s);
    suggestWrap.appendChild(chip);
  }

  const input = el("input", "chat-input");
  input.type = "text";
  input.placeholder = "Ask a question...";
  input.setAttribute("aria-label", "Ask the assistant");
  const sendBtn = el("button", "chat-send primary", "Send");
  const inputRow = el("div", "chat-input-row");
  inputRow.append(input, sendBtn);

  const footer = el("p", "chat-footer");
  const still = el("span", undefined, "Still stuck? ");
  const human = el("a", undefined, "Talk to a human");
  human.href = "https://www.influencerbutler.com/dashboard/book";
  human.target = "_blank";
  human.rel = "noreferrer";
  footer.append(still, human, el("span", undefined, "."));

  root.append(intro, suggestWrap, log, inputRow, footer);

  function addBubble(role: "user" | "assistant" | "error", text: string): HTMLDivElement {
    const bubble = el("div", `chat-msg ${role}`, text);
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  async function send(text: string): Promise<void> {
    const content = text.trim();
    if (!content || sending) return;
    sending = true;
    sendBtn.disabled = true;
    input.value = "";
    suggestWrap.style.display = "none";

    messages.push({ role: "user", content });
    addBubble("user", content);
    const thinking = addBubble("assistant", "Thinking...");
    thinking.classList.add("thinking");

    try {
      const res = await sendToBackground<AiChatResult>({ kind: "AI_CHAT", messages });
      thinking.remove();
      if (res.ok && res.reply) {
        messages.push({ role: "assistant", content: res.reply });
        addBubble("assistant", res.reply);
      } else {
        addBubble("error", res.error || "The assistant is unavailable right now.");
      }
    } catch {
      thinking.remove();
      addBubble("error", "Could not reach the assistant.");
    } finally {
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.onclick = () => void send(input.value);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void send(input.value);
  });
  input.focus();
}

main();
