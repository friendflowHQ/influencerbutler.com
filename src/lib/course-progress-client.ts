/**
 * Client-side course progress store (localStorage). Shared by the tutorial
 * page progress component and the course hub. The canonical step key format
 * "<moduleId>:<stepId>" matches the data-step-id attribute the markdown
 * renderer emits, and is the same key scheme the desktop app persists under
 * hudState, so the two surfaces stay mergeable later.
 */

export type ModuleProgress = { done: number; total: number };

export type CourseProgressBlob = {
  steps: Record<string, true>;
  modules: Record<string, ModuleProgress>;
  lastModuleId?: string;
  updatedAt?: number;
};

const EMPTY: CourseProgressBlob = { steps: {}, modules: {} };

export function storageKey(seriesId: string): string {
  return `ib-course:${seriesId}`;
}

export function readProgress(seriesId: string): CourseProgressBlob {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(storageKey(seriesId));
    if (!raw) return { steps: {}, modules: {} };
    const parsed = JSON.parse(raw) as CourseProgressBlob;
    return {
      steps: parsed.steps && typeof parsed.steps === "object" ? parsed.steps : {},
      modules: parsed.modules && typeof parsed.modules === "object" ? parsed.modules : {},
      lastModuleId: typeof parsed.lastModuleId === "string" ? parsed.lastModuleId : undefined,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : undefined,
    };
  } catch {
    return { steps: {}, modules: {} };
  }
}

export function writeProgress(seriesId: string, blob: CourseProgressBlob): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(seriesId),
      JSON.stringify({ ...blob, updatedAt: Date.now() }),
    );
  } catch {
    // Storage full or blocked: progress just does not persist this session.
  }
}

/** Union merge: a step checked in either source stays checked. */
export function mergeProgress(
  local: CourseProgressBlob,
  remote: CourseProgressBlob,
): CourseProgressBlob {
  const steps = { ...remote.steps, ...local.steps };
  const modules: Record<string, ModuleProgress> = { ...remote.modules };
  for (const [id, mp] of Object.entries(local.modules)) {
    const other = modules[id];
    modules[id] = !other || mp.done >= other.done ? mp : other;
  }
  return {
    steps,
    modules,
    lastModuleId: local.lastModuleId || remote.lastModuleId,
    updatedAt: Date.now(),
  };
}

export function isModuleDone(blob: CourseProgressBlob, moduleId: string): boolean {
  const mp = blob.modules[moduleId];
  return Boolean(mp && mp.total > 0 && mp.done >= mp.total);
}

export function countModulesDone(blob: CourseProgressBlob, moduleIds: string[]): number {
  return moduleIds.filter((id) => isModuleDone(blob, id)).length;
}
