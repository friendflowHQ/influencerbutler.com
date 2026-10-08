"use client";

/**
 * Topic chips for call bookings: read-only pills (TopicChips) and the
 * multi-select used by the booking form and the admin Add call form
 * (TopicPicker). Pills are buttons only when an onClick is supplied, so they
 * stay keyboard-reachable in the filter bar and plain text elsewhere.
 */

import { CALL_TOPICS, MAX_TOPICS, topicsForBooking, type DisplayTopic } from "@/lib/call-topics";

export function TopicChip({ topic, onClick, active, size = "sm" }: { topic: DisplayTopic; onClick?: () => void; active?: boolean; size?: "xs" | "sm" }) {
  const pad = size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs";
  const base = `inline-flex items-center rounded-full font-medium ring-1 ring-inset ${pad} ${topic.chipClass} ${topic.guessed ? "border border-dashed border-current/40" : ""}`;
  const title = topic.guessed ? "Suggested from the free-text description" : undefined;
  if (!onClick) return <span className={base} title={title}>{topic.label}</span>;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={title}
      className={`${base} hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 ${active ? "outline outline-2 outline-offset-1 outline-slate-700" : ""}`}>
      {topic.label}
    </button>
  );
}

/** Chips for one booking (its picks, or suggestions for legacy free-text rows). */
export function TopicChips({ booking, size }: { booking: { topics?: string[] | null; topic?: string | null }; size?: "xs" | "sm" }) {
  const chips = topicsForBooking(booking);
  if (chips.length === 0) return null;
  return <span className="inline-flex flex-wrap gap-1">{chips.map((c) => <TopicChip key={c.key} topic={c} size={size} />)}</span>;
}

/** Multi-select of the topic list, capped at MAX_TOPICS. */
export function TopicPicker({ value, onChange, legend = "What is this about?", hint }: { value: string[]; onChange: (next: string[]) => void; legend?: string; hint?: string }) {
  const full = value.length >= MAX_TOPICS;
  return (
    <fieldset>
      <legend className="text-sm text-slate-700">{legend} <span className="text-xs text-slate-500">(pick up to {MAX_TOPICS})</span></legend>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {CALL_TOPICS.map((t) => {
          const on = value.includes(t.key);
          const disabled = !on && full;
          return (
            <button key={t.key} type="button" aria-pressed={on} disabled={disabled}
              onClick={() => onChange(on ? value.filter((k) => k !== t.key) : [...value, t.key])}
              className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 disabled:cursor-not-allowed disabled:opacity-40 ${on ? `${t.chipClass} font-medium outline outline-2 outline-offset-1 outline-slate-700` : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"}`}>
              {on ? "✓ " : ""}{t.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
