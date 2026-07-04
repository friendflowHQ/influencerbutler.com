"use client";

/**
 * Client overlay for the course hub: reads localStorage progress, decorates
 * the server-rendered module cards with completion checkmarks, shows the
 * overall progress bar + continue button, and handles ?resume=<token> links
 * from the "save my progress" email.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  countModulesDone,
  isModuleDone,
  mergeProgress,
  readProgress,
  writeProgress,
  type CourseProgressBlob,
} from "@/lib/course-progress-client";

type ModuleRef = { id: string; title: string; seriesOrder: number };

export default function CourseHubClient({
  seriesId,
  modules,
}: {
  seriesId: string;
  modules: ModuleRef[];
}) {
  const [blob, setBlob] = useState<CourseProgressBlob | null>(null);
  const [resumed, setResumed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      let progress = readProgress(seriesId);
      const params = new URLSearchParams(window.location.search);
      const token = params.get("resume");
      if (token) {
        try {
          const res = await fetch(`/api/course/progress?token=${encodeURIComponent(token)}`);
          const data = await res.json().catch(() => null);
          if (res.ok && data?.ok && data.progress && data.series === seriesId) {
            progress = mergeProgress(progress, data.progress as CourseProgressBlob);
            writeProgress(seriesId, progress);
            if (!cancelled) setResumed(true);
          }
        } catch {
          // Resume is best-effort; local progress still applies.
        }
        params.delete("resume");
        const rest = params.toString();
        window.history.replaceState(
          null,
          "",
          window.location.pathname + (rest ? `?${rest}` : ""),
        );
      }
      if (!cancelled) setBlob(progress);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [seriesId]);

  // Decorate the server-rendered module cards with completion state.
  useEffect(() => {
    if (!blob) return;
    for (const m of modules) {
      const card = document.querySelector(`[data-course-module="${m.id}"]`);
      const badge = card?.querySelector("[data-module-badge]");
      if (!badge) continue;
      if (isModuleDone(blob, m.id)) {
        badge.textContent = "✓";
        badge.className =
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-600 text-sm font-bold text-white";
      }
    }
  }, [blob, modules]);

  if (!blob) return <div className="mt-8 h-16" aria-hidden="true" />;

  const done = countModulesDone(blob, modules.map((m) => m.id));
  const pct = modules.length ? Math.round((done / modules.length) * 100) : 0;
  const continueTarget =
    (blob.lastModuleId && !isModuleDone(blob, blob.lastModuleId) && blob.lastModuleId) ||
    modules.find((m) => !isModuleDone(blob, m.id))?.id ||
    modules[0]?.id;
  const started = done > 0 || Object.keys(blob.steps).length > 0;

  return (
    <div className="mt-8 rounded-xl border border-slate-200 p-5">
      {resumed ? (
        <p className="mb-3 text-sm font-semibold text-emerald-700">
          Welcome back! Your saved progress was loaded onto this device.
        </p>
      ) : null}
      <div className="flex items-center gap-4">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-orange-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">
          {done}/{modules.length} modules
        </span>
      </div>
      {continueTarget ? (
        <Link
          href={`/course/amazon-influencer/${continueTarget}`}
          className="mt-4 inline-block rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          {started ? "Continue where you left off →" : "Start Module 1 →"}
        </Link>
      ) : null}
    </div>
  );
}
