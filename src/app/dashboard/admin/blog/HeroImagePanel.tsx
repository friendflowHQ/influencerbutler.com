"use client";

// Hero image management for a blog post: shows the current committed image,
// generates a new one with AI (gpt-image-1, branded style, from the post's
// imagePrompt), or accepts an uploaded PNG. Generated/uploaded images are
// previewed locally as base64 first; "Use this image" commits the PNG to the
// repo (the public URL 404s until that deploy lands, so the local preview is
// what the admin sees immediately).

import { useRef, useState } from "react";
import { setDeployNotice } from "./types";

type Props = {
  id: string;
  imagePrompt: string;
  /** Public path of the committed hero, e.g. /assets/blog/<id>.png */
  imagePath: string;
  onCommitted?: (commitSha: string) => void;
};

export default function HeroImagePanel({ id, imagePrompt, imagePath, onCommitted }: Props) {
  const [pendingB64, setPendingB64] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [committedB64, setCommittedB64] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const generate = async () => {
    setError(null);
    setNotice(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/blog/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, imagePrompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Generation failed (${res.status})`);
      setPendingB64(json.b64 as string);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const onUpload = (file: File) => {
    setError(null);
    setNotice(null);
    if (file.type !== "image/png") {
      setError("Please upload a PNG file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const b64 = dataUrl.split(",")[1] || "";
      if (!b64) {
        setError("Could not read that file.");
        return;
      }
      // Warn (not block) when the aspect ratio strays far from the 3:2 the
      // blog layout expects (1536x1024).
      const img = new Image();
      img.onload = () => {
        const ratio = img.width / img.height;
        if (ratio < 1.3 || ratio > 1.7) {
          setNotice(
            `Heads up: this image is ${img.width}x${img.height}; heroes are 3:2 landscape (1536x1024).`,
          );
        }
        setPendingB64(b64);
      };
      img.onerror = () => setPendingB64(b64);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const commit = async () => {
    if (!pendingB64) return;
    setError(null);
    setCommitting(true);
    try {
      const res = await fetch("/api/admin/blog/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, b64: pendingB64 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Image commit failed (${res.status})`);
      setCommittedB64(pendingB64);
      setPendingB64(null);
      setNotice("Image committed - it goes live with the next deploy (~2-3 min).");
      setDeployNotice(json.commitSha as string, "Hero image committed");
      onCommitted?.(json.commitSha as string);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCommitting(false);
    }
  };

  const previewSrc = pendingB64
    ? `data:image/png;base64,${pendingB64}`
    : committedB64
      ? `data:image/png;base64,${committedB64}`
      : imagePath;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Hero image</h2>
      <p className="mt-1 text-xs text-slate-500">
        Committed to <code className="rounded bg-slate-100 px-1">{imagePath}</code>
      </p>

      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewSrc}
          alt="Hero preview"
          className="aspect-[3/2] w-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>

      {pendingB64 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={commit}
            disabled={committing}
            className="rounded-lg bg-[#f97316] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#ea580c] disabled:opacity-50"
          >
            {committing ? "Committing..." : "Use this image"}
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={generating || !imagePrompt.trim()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {generating ? "Generating..." : "Regenerate"}
          </button>
          <button
            type="button"
            onClick={() => setPendingB64(null)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Discard
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={generating || !imagePrompt.trim()}
            title={imagePrompt.trim() ? "" : "Add an image prompt first"}
            className="rounded-lg bg-[#f97316] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#ea580c] disabled:opacity-50"
          >
            {generating ? "Generating (30-90s)..." : "Generate with AI"}
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Upload PNG
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {generating ? (
        <p className="mt-2 text-xs text-slate-500">
          Generating the branded illustration - this usually takes 30-90 seconds.
        </p>
      ) : null}
      {notice ? <p className="mt-2 text-xs text-amber-700">{notice}</p> : null}
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
