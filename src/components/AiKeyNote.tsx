import Link from "next/link";

/** The one setup guide every "needs your OpenAI key" message points to. */
export const OPENAI_SETUP_HREF = "/help/tutorials/openai-api-setup";

type Props = {
  className?: string;
  /** Short one-paragraph version for tight spots (plan pickers, hero lines). */
  compact?: boolean;
};

/**
 * Canonical "AI butlers use your own OpenAI key" callout. Server-safe (no
 * hooks, no browser APIs) so it can be rendered from server and client trees.
 * Styled like the amber/orange callout on the welcome pages. Orange text uses
 * #c2410c (WCAG AA on white); the link is underlined.
 */
export default function AiKeyNote({ className = "", compact = false }: Props) {
  return (
    <aside
      aria-label="AI butlers need your own OpenAI key"
      className={`rounded-xl border border-[#f97316]/30 bg-[#f97316]/5 p-4 text-left ${className}`.trim()}
    >
      <p className="text-sm font-semibold text-[#c2410c]">Needs your OpenAI key</p>
      <p className="mt-1 text-sm text-slate-700">
        AI butlers use your own OpenAI API key. You pay OpenAI directly for what you use (usually
        pennies), not Influencer Butler. A ChatGPT subscription does not work.{" "}
        <Link
          href={OPENAI_SETUP_HREF}
          className="font-semibold text-[#c2410c] underline hover:text-[#9a3412]"
        >
          How to set up your key
        </Link>
        .
      </p>
      {compact ? null : (
        <p className="mt-2 text-sm text-slate-600">
          Included with no key: the AI Assistant and the extension&apos;s free caption engine run on
          our servers.
        </p>
      )}
    </aside>
  );
}
