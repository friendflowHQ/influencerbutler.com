import { sendToBackground, type VideoReloadRef } from "../../shared/messages";

export type BrowserBumpResult = { ok: boolean; message?: string };

// Entry point for the "This browser" run-on choice (background/video-bump.ts
// does the actual work). "assist" stops once the video is downloaded and
// reports the title/tags to copy; "auto" continues on to delete the old video,
// wait out Amazon's duplicate-detection cooldown, and reopen a fresh upload
// page for the one step Chrome keeps manual (attaching the file) - see that
// module for the full step sequence. Resolves once the quick part (capture +
// download) finishes; an "auto" job's delete/wait/reupload continue in the
// background and report their own completion via a desktop-style
// notification, regardless of whether this page stays open.
export async function runBrowserBump(
  video: VideoReloadRef,
  mode: "auto" | "assist",
): Promise<BrowserBumpResult> {
  return sendToBackground<BrowserBumpResult>({
    kind: "START_VIDEO_BUMP",
    video,
    mode,
  });
}
