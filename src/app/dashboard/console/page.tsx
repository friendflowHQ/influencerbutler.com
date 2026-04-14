"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyboardShortcutsContext } from "@/contexts/KeyboardShortcutsContext";
import type { ShortcutDef } from "@/hooks/useKeyboardShortcuts";

type LogLevel = "info" | "warn" | "error" | "debug";

type LogEntry = {
  id: string;
  timestamp: string;
  tsMs: number;
  level: LogLevel;
  message: string;
  meta: Record<string, unknown>;
  tags: string[];
};

type TimeRangePreset = "any" | "5m" | "15m" | "1h" | "24h" | "custom";

type TimeRangeState = {
  preset: TimeRangePreset;
  customStart: string; // datetime-local value
  customEnd: string;
};

const STORAGE_KEY = "console-filter-state";

function loadPersistedTimeRange(): TimeRangeState {
  if (typeof window === "undefined") {
    return { preset: "any", customStart: "", customEnd: "" };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TimeRangeState;
      if (parsed.preset && typeof parsed.customStart === "string") {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return { preset: "any", customStart: "", customEnd: "" };
}

function persistTimeRange(state: TimeRangeState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

const sampleLogs: LogEntry[] = [
  {
    id: "1",
    timestamp: "2026-04-14T10:23:01Z",
    tsMs: new Date("2026-04-14T10:23:01Z").getTime(),
    level: "info",
    message: "User signed in successfully",
    meta: { userId: "usr_8a3f2", ip: "192.168.1.42", method: "oauth" },
    tags: ["auth", "login"],
  },
  {
    id: "2",
    timestamp: "2026-04-14T10:23:45Z",
    tsMs: new Date("2026-04-14T10:23:45Z").getTime(),
    level: "warn",
    message: "Rate limit threshold approaching for API key",
    meta: { apiKey: "key_***f9d", usage: 4500, limit: 5000 },
    tags: ["rate-limit", "api"],
  },
  {
    id: "3",
    timestamp: "2026-04-14T10:24:12Z",
    tsMs: new Date("2026-04-14T10:24:12Z").getTime(),
    level: "error",
    message: "Payment webhook failed: invalid signature",
    meta: {
      webhookId: "wh_92c1e",
      provider: "lemonsqueezy",
      error: { code: "SIG_MISMATCH", detail: "HMAC verification failed" },
    },
    tags: ["payment", "webhook", "critical"],
  },
  {
    id: "4",
    timestamp: "2026-04-14T10:25:00Z",
    tsMs: new Date("2026-04-14T10:25:00Z").getTime(),
    level: "debug",
    message: "Cache miss for subscription lookup",
    meta: { cacheKey: "sub:usr_8a3f2", ttl: 300 },
    tags: ["cache"],
  },
  {
    id: "5",
    timestamp: "2026-04-14T10:25:33Z",
    tsMs: new Date("2026-04-14T10:25:33Z").getTime(),
    level: "info",
    message: "Subscription renewed for user",
    meta: { userId: "usr_8a3f2", plan: "annual", amount: 99.99 },
    tags: ["billing", "subscription"],
  },
  {
    id: "6",
    timestamp: "2026-04-14T10:26:10Z",
    tsMs: new Date("2026-04-14T10:26:10Z").getTime(),
    level: "info",
    message: "Email notification sent",
    meta: {},
    tags: [],
  },
  {
    id: "7",
    timestamp: "2026-04-14T10:27:44Z",
    tsMs: new Date("2026-04-14T10:27:44Z").getTime(),
    level: "error",
    message: "Database connection pool exhausted",
    meta: {
      pool: "primary",
      activeConnections: 50,
      maxConnections: 50,
      waitingQueries: 12,
    },
    tags: ["database", "critical", "infrastructure"],
  },
];

const levelStyles: Record<LogLevel, { bg: string; text: string; dot: string }> = {
  info: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  warn: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  error: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  debug: { bg: "bg-slate-50", text: "text-slate-500", dot: "bg-slate-400" },
};

const tagColors = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-pink-100 text-pink-700",
  "bg-lime-100 text-lime-700",
];

function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return tagColors[Math.abs(hash) % tagColors.length];
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function hasDetails(entry: LogEntry): boolean {
  return entry.tags.length > 0 || Object.keys(entry.meta).length > 0;
}

function MetaValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-slate-400 italic">null</span>;
  }
  if (typeof value === "object") {
    return (
      <pre className="mt-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 overflow-x-auto">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  if (typeof value === "number") {
    return <span className="font-mono text-indigo-600">{String(value)}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="font-mono text-emerald-600">{String(value)}</span>;
  }
  return <span className="text-slate-800">{String(value)}</span>;
}

type LogRowProps = {
  entry: LogEntry;
  isExpanded: boolean;
  isFocused: boolean;
  onToggle: () => void;
};

function LogRow({ entry, isExpanded, isFocused, onToggle }: LogRowProps) {
  const style = levelStyles[entry.level];
  const expandable = hasDetails(entry);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFocused && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isFocused]);

  return (
    <div
      ref={rowRef}
      className={[
        "border-b border-slate-100 last:border-b-0",
        isFocused ? "ring-2 ring-[#f97316] ring-inset rounded" : "",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => expandable && onToggle()}
        className={[
          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
          expandable ? "cursor-pointer hover:bg-slate-50" : "cursor-default",
        ].join(" ")}
        aria-expanded={expandable ? isExpanded : undefined}
        disabled={!expandable}
      >
        {/* Chevron */}
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          {expandable ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className={[
                "h-3.5 w-3.5 text-slate-400 transition-transform duration-150",
                isExpanded ? "rotate-90" : "",
              ].join(" ")}
            >
              <path
                fillRule="evenodd"
                d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <span className="h-3.5 w-3.5" />
          )}
        </span>

        {/* Timestamp */}
        <span className="shrink-0 font-mono text-xs text-slate-400 leading-5">
          {formatTimestamp(entry.timestamp)}
        </span>

        {/* Level badge */}
        <span
          className={[
            "mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none",
            style.bg,
            style.text,
          ].join(" ")}
        >
          <span className={["inline-block h-1.5 w-1.5 rounded-full", style.dot].join(" ")} />
          {entry.level}
        </span>

        {/* Message */}
        <span className="min-w-0 flex-1 text-sm text-slate-800 leading-5">{entry.message}</span>
      </button>

      {/* Expandable detail section */}
      {isExpanded && (
        <div className="ml-11 mr-4 mb-3 rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3">
          {/* Tags */}
          {entry.tags.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {entry.tags.map((tag) => (
                  <span
                    key={tag}
                    className={[
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                      getTagColor(tag),
                    ].join(" ")}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          {Object.keys(entry.meta).length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Metadata
              </p>
              <dl className="space-y-1">
                {Object.entries(entry.meta).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2 text-xs">
                    <dt className="shrink-0 font-mono font-medium text-slate-500">{key}:</dt>
                    <dd className="min-w-0 break-all">
                      <MetaValue value={value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TIME_PRESETS: { key: TimeRangePreset; label: string }[] = [
  { key: "any", label: "Any time" },
  { key: "5m", label: "5m" },
  { key: "15m", label: "15m" },
  { key: "1h", label: "1h" },
  { key: "24h", label: "24h" },
  { key: "custom", label: "Custom" },
];

const PRESET_MS: Record<string, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

function customRangeError(start: string, end: string): string | null {
  if (!start || !end) return "Select both start and end times";
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return "Invalid date";
  if (s >= e) return "Start must be before end";
  return null;
}

export default function ConsolePage() {
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [timeRange, setTimeRange] = useState<TimeRangeState>({
    preset: "any",
    customStart: "",
    customEnd: "",
  });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const { registerShortcuts, unregisterShortcuts } = useKeyboardShortcutsContext();
  const filteredLenRef = useRef(0);

  // Load persisted time range on mount
  useEffect(() => {
    setTimeRange(loadPersistedTimeRange());
  }, []);

  const updateTimeRange = useCallback((next: TimeRangeState) => {
    setTimeRange(next);
    persistTimeRange(next);
  }, []);

  const handlePresetClick = useCallback(
    (preset: TimeRangePreset) => {
      updateTimeRange({
        preset,
        customStart: preset === "custom" ? timeRange.customStart : "",
        customEnd: preset === "custom" ? timeRange.customEnd : "",
      });
    },
    [timeRange.customStart, timeRange.customEnd, updateTimeRange],
  );

  // Filter by level
  const levelFiltered =
    filter === "all" ? sampleLogs : sampleLogs.filter((l) => l.level === filter);

  // Filter by time range
  const filtered = levelFiltered.filter((entry) => {
    if (timeRange.preset === "any") return true;

    if (timeRange.preset === "custom") {
      if (!timeRange.customStart || !timeRange.customEnd) return true;
      const s = new Date(timeRange.customStart).getTime();
      const e = new Date(timeRange.customEnd).getTime();
      if (Number.isNaN(s) || Number.isNaN(e) || s >= e) return true;
      return entry.tsMs >= s && entry.tsMs <= e;
    }

    // Relative preset
    const ms = PRESET_MS[timeRange.preset];
    if (!ms) return true;
    const cutoff = Date.now() - ms;
    return entry.tsMs >= cutoff;
  });

  const validationError =
    timeRange.preset === "custom"
      ? customRangeError(timeRange.customStart, timeRange.customEnd)
      : null;

  // Keep ref in sync for keyboard handlers
  filteredLenRef.current = filtered.length;

  // Reset focused index when filters change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [filter, timeRange.preset]);

  // Register console-specific keyboard shortcuts
  useEffect(() => {
    const toggleExpanded = (id: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    const shortcuts: ShortcutDef[] = [
      { key: "1", handler: () => setFilter("all"), description: "Filter: all", category: "Console" },
      { key: "2", handler: () => setFilter("info"), description: "Filter: info", category: "Console" },
      { key: "3", handler: () => setFilter("warn"), description: "Filter: warn", category: "Console" },
      { key: "4", handler: () => setFilter("error"), description: "Filter: error", category: "Console" },
      { key: "5", handler: () => setFilter("debug"), description: "Filter: debug", category: "Console" },
      {
        key: "j",
        handler: () =>
          setFocusedIndex((i) => Math.min(i + 1, filteredLenRef.current - 1)),
        description: "Next log entry",
        category: "Console",
      },
      {
        key: "k",
        handler: () => setFocusedIndex((i) => Math.max(i - 1, 0)),
        description: "Previous log entry",
        category: "Console",
      },
      {
        key: "Enter",
        handler: () => {
          setFocusedIndex((i) => {
            if (i >= 0 && i < filteredLenRef.current) {
              const entry = filtered[i];
              if (entry && hasDetails(entry)) toggleExpanded(entry.id);
            }
            return i;
          });
        },
        description: "Expand/collapse entry (Enter / x)",
        category: "Console",
      },
      {
        key: "x",
        handler: () => {
          setFocusedIndex((i) => {
            if (i >= 0 && i < filteredLenRef.current) {
              const entry = filtered[i];
              if (entry && hasDetails(entry)) toggleExpanded(entry.id);
            }
            return i;
          });
        },
        description: "",
        category: "Console",
      },
      { key: "a", chord: "t", handler: () => handlePresetClick("any"), description: "Time: any", category: "Console" },
      { key: "5", chord: "t", handler: () => handlePresetClick("5m"), description: "Time: 5m", category: "Console" },
      { key: "1", chord: "t", handler: () => handlePresetClick("15m"), description: "Time: 15m", category: "Console" },
      { key: "h", chord: "t", handler: () => handlePresetClick("1h"), description: "Time: 1h", category: "Console" },
      { key: "d", chord: "t", handler: () => handlePresetClick("24h"), description: "Time: 24h", category: "Console" },
      { key: "c", chord: "t", handler: () => handlePresetClick("custom"), description: "Time: custom", category: "Console" },
    ];

    registerShortcuts("console", shortcuts);
    return () => unregisterShortcuts("console");
  }, [registerShortcuts, unregisterShortcuts, handlePresetClick, filtered]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Console</h1>
        <p className="mt-1 text-sm text-slate-600">
          View application logs and events. Expand entries to see metadata and tags.
        </p>
      </div>

      {/* Level filter bar */}
      <div className="flex items-center gap-2">
        {(["all", "info", "warn", "error", "debug"] as const).map((level) => {
          const active = filter === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => setFilter(level)}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition",
                active
                  ? "bg-[#f97316] text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-800",
              ].join(" ")}
            >
              {level}
            </button>
          );
        })}
        <span className="ml-auto text-xs text-slate-400">
          {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Time range filter bar */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 mr-1">Time:</span>
          {TIME_PRESETS.map(({ key, label }) => {
            const active = timeRange.preset === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handlePresetClick(key)}
                className={[
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "bg-[#f97316] text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-800",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Custom range inputs */}
        {timeRange.preset === "custom" && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span className="font-medium">From</span>
              <input
                type="datetime-local"
                value={timeRange.customStart}
                onChange={(e) =>
                  updateTimeRange({ ...timeRange, customStart: e.target.value })
                }
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 font-mono focus:border-[#f97316] focus:ring-1 focus:ring-[#f97316] focus:outline-none transition"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span className="font-medium">To</span>
              <input
                type="datetime-local"
                value={timeRange.customEnd}
                onChange={(e) =>
                  updateTimeRange({ ...timeRange, customEnd: e.target.value })
                }
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 font-mono focus:border-[#f97316] focus:ring-1 focus:ring-[#f97316] focus:outline-none transition"
              />
            </label>
            {validationError && timeRange.customStart && timeRange.customEnd && (
              <span className="text-xs text-red-500 font-medium">{validationError}</span>
            )}
          </div>
        )}
      </div>

      {/* Log list */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">No log entries found.</p>
        ) : (
          filtered.map((entry, index) => (
            <LogRow
              key={entry.id}
              entry={entry}
              isExpanded={expandedIds.has(entry.id)}
              isFocused={index === focusedIndex}
              onToggle={() => {
                setExpandedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(entry.id)) next.delete(entry.id);
                  else next.add(entry.id);
                  return next;
                });
              }}
            />
          ))
        )}
      </div>
    </section>
  );
}
