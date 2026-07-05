/**
 * Summary: Server-only helper resolving a course module's hero image. Returns
 *   the public path when public/assets/course/<id>.png exists, else null so
 *   pages degrade to the emoji-only header. Kept separate from course.ts
 *   because that module is imported by client components (no node:fs there).
 */
import { existsSync } from "node:fs";
import path from "node:path";

export function courseImage(moduleId: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(moduleId)) return null;
  const rel = `assets/course/${moduleId}.png`;
  return existsSync(path.join(process.cwd(), "public", rel)) ? `/${rel}` : null;
}
