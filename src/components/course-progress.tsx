"use client";

/**
 * Interactive course progress for tutorial pages that belong to a course
 * (manifest entries with a `series`). Wires the checkbox steps the markdown
 * renderer emitted into localStorage, shows a fixed progress bar, module
 * complete celebration, prev/next module links, and the optional
 * "save my progress" email capture.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  countModulesDone,
  readProgress,
  writeProgress,
} from "@/lib/course-progress-client";

type ModuleRef = { id: string; title: string; seriesOrder: number };

export default function CourseProgress({
  seriesId,
  moduleId,
  modules,
  basePath,
}: {
  seriesId: string;
  moduleId: string;
  modules: ModuleRef[];
  /** Route prefix module links live under, e.g. "/course/amazon-influencer". */
  basePath: string;
}) {
  const [stepsDone, setStepsDone] = useState(0);
  const [stepsTotal, setStepsTotal] = useState(0);
  const [modulesDone, setModulesDone] = useState(0);
  const [justCompleted, setJustCompleted] = useState(false);
  const [email, setEmail] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const wasCompleteRef = useRef(false);

  const moduleIds = modules.map((m) => m.id);
  const idx = modules.findIndex((m) => m.id === moduleId);
  const prev = idx > 0 ? modules[idx - 1] : null;
  const next = idx >= 0 && idx < modules.length - 1 ? modules[idx + 1] : null;

  const recompute = useCallback(
    (boxes: HTMLInputElement[]) => {
      const blob = readProgress(seriesId);
      const done = boxes.filter((b) => b.checked).length;
      for (const box of boxes) {
        const key = box.dataset.stepId || "";
        if (!key) continue;
        if (box.checked) blob.steps[key] = true;
        else delete blob.steps[key];
      }
      blob.modules[moduleId] = { done, total: boxes.length };
      blob.lastModuleId = moduleId;
      writeProgress(seriesId, blob);
      setStepsDone(done);
      setStepsTotal(boxes.length);
      setModulesDone(countModulesDone(blob, moduleIds));
      const complete = boxes.length > 0 && done === boxes.length;
      if (complete && !wasCompleteRef.current) setJustCompleted(true);
      wasCompleteRef.current = complete;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seriesId, moduleId],
  );

  useEffect(() => {
    const article = document.querySelector(".help-tutorial-body");
    if (!article) return;
    const boxes = Array.from(
      article.querySelectorAll<HTMLInputElement>("input[data-step-id]"),
    );
    const blob = readProgress(seriesId);
    for (const box of boxes) {
      const key = box.dataset.stepId || "";
      box.checked = Boolean(key && blob.steps[key]);
      box.disabled = false;
    }
    wasCompleteRef.current = boxes.length > 0 && boxes.every((b) => b.checked);
    const onChange = () => recompute(boxes);
    for (const box of boxes) box.addEventListener("change", onChange);
    // Initial paint without re-writing lastModuleId celebration state.
    setStepsDone(boxes.filter((b) => b.checked).length);
    setStepsTotal(boxes.length);
    setModulesDone(countModulesDone(blob, moduleIds));
    blob.lastModuleId = moduleId;
    blob.modules[moduleId] = {
      done: boxes.filter((b) => b.checked).length,
      total: boxes.length,
    };
    writeProgress(seriesId, blob);
    return () => {
      for (const box of boxes) box.removeEventListener("change", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, moduleId, recompute]);

  async function saveToEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/course/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          seriesId,
          progress: readProgress(seriesId),
        }),
      });
      const data = await res.json().catch(() => null);
      setSaveState(res.ok && data?.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }

  const modulePct = stepsTotal ? Math.round((stepsDone / stepsTotal) * 100) : 0;

  return (
    <>
      {/* Fixed course progress bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-2.5 text-xs sm:text-sm">
          <span className="font-semibold text-slate-700 whitespace-nowrap">
            Module {idx + 1} of {modules.length}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-orange-500 transition-all duration-500"
              style={{ width: `${modulePct}%` }}
            />
          </div>
          <span className="text-slate-600 whitespace-nowrap">
            {stepsDone}/{stepsTotal} steps
          </span>
          <span className="hidden text-slate-500 sm:inline whitespace-nowrap">
            Course: {modulesDone}/{modules.length} done
          </span>
        </div>
      </div>

      {/* Module complete celebration */}
      {justCompleted ? (
        <div className="mt-8 animate-pulse rounded-xl border border-orange-300 bg-orange-50 p-5 text-center">
          <p className="text-lg font-bold text-orange-700">Module complete! 🎉</p>
          {next ? (
            <p className="mt-1 text-sm text-orange-700">
              Keep the momentum:{" "}
              <Link href={`${basePath}/${next.id}`} className="font-semibold underline">
                {next.title}
              </Link>
            </p>
          ) : (
            <p className="mt-1 text-sm text-orange-700">
              That was the last module. You finished the course!
            </p>
          )}
        </div>
      ) : null}

      {/* Prev / next module navigation */}
      <nav className="mt-10 flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-between">
        {prev ? (
          <Link
            href={`${basePath}/${prev.id}`}
            className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:border-orange-400 hover:text-orange-700"
          >
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`${basePath}/${next.id}`}
            className="rounded-lg bg-orange-600 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-700 sm:text-right"
          >
            Next: {next.title} →
          </Link>
        ) : null}
      </nav>

      {/* Save progress via email */}
      <div className="mb-10 mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
        {saveState === "saved" ? (
          <p className="text-sm font-semibold text-emerald-700">
            Progress saved. Check your inbox for your resume link.
          </p>
        ) : (
          <form onSubmit={saveToEmail} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">
                Want your progress on every device?
              </p>
              <p className="text-xs text-slate-600">
                Progress saves in this browser automatically. Add your email to get a resume
                link that works anywhere.
              </p>
            </div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={saveState === "saving"}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {saveState === "saving" ? "Saving..." : "Save my progress"}
            </button>
          </form>
        )}
        {saveState === "error" ? (
          <p className="mt-2 text-xs text-red-600">
            Could not save right now. Your progress is still safe in this browser.
          </p>
        ) : null}
      </div>

      {/* Bottom spacer so the fixed bar never covers content */}
      <div className="h-12" />
    </>
  );
}
