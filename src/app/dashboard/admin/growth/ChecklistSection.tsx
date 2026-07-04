"use client";

// Monthly growth checklist: seeded from the idea library, fully editable,
// progress ring, and a one-time confetti when the whole month is done.

import { useCallback, useEffect, useRef, useState } from "react";
import ProgressRing from "./ProgressRing";

type Item = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  source: string;
  sort: number;
  doneAt: string | null;
};

type ChecklistResponse = {
  month?: string;
  migrationPending?: boolean;
  items?: Item[];
  celebratedAt?: string | null;
  error?: string;
};

const CATEGORY_STYLES: Record<string, { dot: string; label: string }> = {
  content: { dot: "bg-sky-500", label: "Content" },
  affiliates: { dot: "bg-orange-500", label: "Affiliates" },
  conversion: { dot: "bg-emerald-500", label: "Conversion" },
  retention: { dot: "bg-violet-500", label: "Retention" },
  community: { dot: "bg-amber-500", label: "Community" },
};

const CATEGORIES = Object.keys(CATEGORY_STYLES);

export default function ChecklistSection({
  month,
  isCurrentMonth,
  onCelebrate,
}: {
  month: string;
  isCurrentMonth: boolean;
  onCelebrate: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("content");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const celebrateRequested = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/growth/checklist?month=${month}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as ChecklistResponse;
      setData(json);

      // Whole month freshly complete: confetti once, then stamp the marker.
      const items = json.items ?? [];
      const allDone = items.length > 0 && items.every((i) => i.doneAt !== null);
      if (allDone && !json.celebratedAt && !celebrateRequested.current) {
        celebrateRequested.current = true;
        onCelebrate();
        await fetch("/api/admin/growth/checklist", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "celebrated", month }),
        }).catch(() => null);
      }
    } catch {
      // section renders empty on failure
    } finally {
      setLoading(false);
    }
  }, [month, onCelebrate]);

  useEffect(() => {
    setLoading(true);
    celebrateRequested.current = false;
    void load();
  }, [load]);

  const send = useCallback(
    async (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => {
      try {
        await fetch("/api/admin/growth/checklist", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } finally {
        void load();
      }
    },
    [load],
  );

  const toggle = useCallback(
    (item: Item) => {
      // Optimistic flip so the checkbox pops instantly.
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: (prev.items ?? []).map((i) =>
                i.id === item.id
                  ? { ...i, doneAt: i.doneAt ? null : new Date().toISOString() }
                  : i,
              ),
            }
          : prev,
      );
      void send("PATCH", { id: item.id, action: "toggle", done: item.doneAt === null });
    },
    [send],
  );

  const items = data?.items ?? [];
  const doneCount = items.filter((i) => i.doneAt !== null).length;
  const fraction = items.length > 0 ? doneCount / items.length : 0;
  const allDone = items.length > 0 && doneCount === items.length;

  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
        Grow-the-subscriptions checklist
      </h2>
      {data?.migrationPending ? (
        <p className="mt-1 text-xs text-amber-700">
          The checklist needs the growth tables: run 20260705_growth_dashboard.sql in the Supabase
          SQL editor to light this up.
        </p>
      ) : null}

      {loading ? (
        <div className="mt-3 h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
      ) : (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-4">
            <ProgressRing
              fraction={fraction}
              color={allDone ? "#f59e0b" : "#10b981"}
            >
              <span className="text-sm font-bold text-slate-700">
                {allDone ? "🏆" : `${doneCount}/${items.length || 0}`}
              </span>
            </ProgressRing>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {allDone
                  ? "Month complete. Legend."
                  : items.length === 0
                    ? "Nothing on the list yet."
                    : `${items.length - doneCount} idea${items.length - doneCount === 1 ? "" : "s"} left this month`}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Fresh ideas land automatically at the start of each month. Add your own below.
              </p>
            </div>
          </div>

          <ul className="mt-4 divide-y divide-slate-100">
            {items.map((item) => {
              const cat = CATEGORY_STYLES[item.category] ?? CATEGORY_STYLES.content;
              const done = item.doneAt !== null;
              return (
                <li key={item.id} className="flex items-start gap-3 py-3">
                  <button
                    type="button"
                    onClick={() => toggle(item)}
                    aria-label={done ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`}
                    className={[
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs font-bold transition",
                      done
                        ? "scale-105 border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-300 bg-white text-transparent hover:border-emerald-400",
                    ].join(" ")}
                  >
                    ✓
                  </button>
                  <div className="min-w-0 flex-1">
                    {editingId === item.id ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (editTitle.trim().length > 0) {
                            void send("PATCH", { id: item.id, action: "edit", title: editTitle });
                          }
                          setEditingId(null);
                        }}
                      >
                        <input
                          autoFocus
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          aria-label="Edit item title"
                        />
                        <button type="submit" className="text-xs font-medium text-indigo-600">
                          Save
                        </button>
                      </form>
                    ) : (
                      <>
                        <p
                          className={[
                            "text-sm font-medium",
                            done ? "text-slate-400 line-through" : "text-slate-800",
                          ].join(" ")}
                        >
                          {item.title}
                        </p>
                        {item.description && !done ? (
                          <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
                        ) : null}
                      </>
                    )}
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className={`h-1.5 w-1.5 rounded-full ${cat.dot}`} />
                      {cat.label}
                      {item.source === "custom" ? " · yours" : ""}
                    </p>
                  </div>
                  {isCurrentMonth && editingId !== item.id ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditTitle(item.title);
                        }}
                        className="text-xs font-medium text-slate-400 hover:text-indigo-600"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void send("DELETE", { id: item.id })}
                        className="text-xs font-medium text-slate-400 hover:text-rose-600"
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {isCurrentMonth ? (
            adding ? (
              <form
                className="mt-3 flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newTitle.trim().length === 0) return;
                  void send("POST", { month, title: newTitle, category: newCategory });
                  setNewTitle("");
                  setAdding(false);
                }}
              >
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Your growth idea..."
                  className="min-w-56 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  aria-label="New checklist item"
                />
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-600"
                  aria-label="Category"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_STYLES[c].label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="text-xs font-medium text-slate-400 hover:text-slate-600"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600"
              >
                + Add your own idea
              </button>
            )
          ) : null}
        </div>
      )}
    </section>
  );
}
