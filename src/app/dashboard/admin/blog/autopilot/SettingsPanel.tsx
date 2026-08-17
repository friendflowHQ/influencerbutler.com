"use client";

// Autopilot tunables. Stored in the queue file (versioned, no env changes).

import { useState } from "react";
import type { AutopilotData, AutopilotSettings } from "./autopilot-types";

type Props = {
  data: AutopilotData;
  onSaved: () => void;
};

export default function SettingsPanel({ data, onSaved }: Props) {
  const [settings, setSettings] = useState<AutopilotSettings>(data.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/blog/autopilot/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, expectedHeadSha: data.headSha }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const numberField = (
    key: keyof Pick<AutopilotSettings, "leadDays" | "maxPerRun" | "maxPerDay" | "maxAttempts">,
    label: string,
    hint: string,
  ) => (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input
        type="number"
        min={key === "leadDays" ? 0 : 1}
        max={key === "maxAttempts" ? 10 : key === "leadDays" ? 14 : 5}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#f97316] focus:outline-none"
        value={settings[key]}
        onChange={(e) => setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))}
      />
      <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{hint}</span>
    </label>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Settings</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {numberField(
          "leadDays",
          "Lead days",
          "Posts generate this many days before publishing - your soft review window (the summary email links each draft).",
        )}
        {numberField("maxPerRun", "Max per run", "Posts generated per daily cron run.")}
        {numberField("maxPerDay", "Max per day", "Published posts allowed per calendar day when scheduling.")}
        {numberField("maxAttempts", "Max attempts", "Retries before an item is marked failed.")}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={settings.notify}
          onChange={(e) => setSettings((s) => ({ ...s, notify: e.target.checked }))}
        />
        Email a summary after each run
      </label>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          Writer model: <code className="rounded bg-slate-100 px-1">{data.writerModel}</code> (set
          BLOG_WRITER_MODEL in Vercel to change)
          {data.disabled ? (
            <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
              Autopilot paused via BLOG_AUTOGEN_DISABLED
            </span>
          ) : null}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded-lg bg-[#f97316] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50"
        >
          {busy ? "Saving..." : saved ? "Saved" : "Save settings"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
