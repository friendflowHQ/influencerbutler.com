"use client";

import { useRef, useState } from "react";
import { CONCLUDING_QUESTIONS } from "../../_data/bundleMeta";

export type SubmissionInitial = {
  email: string;
  token: string;
  name: string;
  instagramHandle: string;
  website: string;
  topicTitle: string;
  chapterTitle: string;
  handlesToInclude: string;
  introEarn: string;
  introInspired: string;
  introLove: string;
  chapterBody: string;
  concludeQuestion: string;
  concludeAnswer: string;
  ctaText: string;
  headshotUrl: string;
  alreadySubmitted: boolean;
};

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";
const labelCls = "mb-1 block text-sm font-semibold text-slate-800";

export default function SubmissionForm({ initial }: { initial: SubmissionInitial }) {
  const [name, setName] = useState(initial.name);
  const [handles, setHandles] = useState(initial.handlesToInclude);
  const [website, setWebsite] = useState(initial.website);
  const [introEarn, setIntroEarn] = useState(initial.introEarn);
  const [introInspired, setIntroInspired] = useState(initial.introInspired);
  const [introLove, setIntroLove] = useState(initial.introLove);
  const [chapterTitle, setChapterTitle] = useState(initial.chapterTitle);
  const [chapterBody, setChapterBody] = useState(initial.chapterBody);
  const [concludeQuestion, setConcludeQuestion] = useState(initial.concludeQuestion);
  const [concludeAnswer, setConcludeAnswer] = useState(initial.concludeAnswer);
  const [ctaText, setCtaText] = useState(initial.ctaText);
  const [headshotUrl, setHeadshotUrl] = useState(initial.headshotUrl);

  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadNote("");
    try {
      const fd = new FormData();
      fd.append("email", initial.email);
      fd.append("token", initial.token);
      fd.append("file", file);
      const res = await fetch("/api/grow-together/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.ok || !json.url) {
        setUploadNote(json.error ?? "Upload failed. You can paste an image link below instead.");
        return;
      }
      setHeadshotUrl(json.url);
      setUploadNote("Photo uploaded.");
    } catch {
      setUploadNote("Upload failed. You can paste an image link below instead.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chapterBody.trim()) {
      setStatus("error");
      setMessage("Please write your chapter before submitting.");
      return;
    }
    setStatus("saving");
    setMessage("");
    try {
      const res = await fetch("/api/grow-together/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: initial.email,
          token: initial.token,
          name: name.trim() || undefined,
          website: website.trim() || undefined,
          handlesToInclude: handles.trim() || undefined,
          introEarn: introEarn.trim() || undefined,
          introInspired: introInspired.trim() || undefined,
          introLove: introLove.trim() || undefined,
          chapterTitle: chapterTitle.trim() || undefined,
          chapterBody: chapterBody.trim(),
          concludeQuestion: concludeQuestion || undefined,
          concludeAnswer: concludeAnswer.trim() || undefined,
          ctaText: ctaText.trim() || undefined,
          headshotUrl: headshotUrl.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setStatus("error");
        setMessage(json.error ?? "Could not save your chapter. Please retry.");
        return;
      }
      setStatus("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setStatus("error");
      setMessage("Network error. Please retry.");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <h2 className="text-xl font-bold text-green-900">Chapter received. Thank you!</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-green-800">
          We emailed you a confirmation. You can revise your chapter any time before the deadline
          using the same link. We will send launch-week details soon.
        </p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-4 rounded-lg border border-green-300 px-4 py-2 text-sm font-semibold text-green-800 hover:bg-green-100"
        >
          Edit my submission
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {initial.alreadySubmitted ? (
        <p className="rounded-lg bg-orange-50 p-3 text-sm text-orange-800">
          You have already submitted. Anything you change here will update your chapter.
        </p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">About you</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="s-name" className={labelCls}>Name (as it should appear)</label>
            <input id="s-name" value={name} onChange={(ev) => setName(ev.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="s-handles" className={labelCls}>Social handles to include</label>
            <input id="s-handles" value={handles} onChange={(ev) => setHandles(ev.target.value)} className={inputCls} placeholder="@yourhandle, TikTok @you, ..." />
          </div>
          <div>
            <label htmlFor="s-website" className={labelCls}>Website or storefront</label>
            <input id="s-website" value={website} onChange={(ev) => setWebsite(ev.target.value)} className={inputCls} placeholder="yoursite.com" />
          </div>
          <div>
            <label htmlFor="s-photo" className={labelCls}>Photo or logo</label>
            <input id="s-photo" ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onPickFile} disabled={uploading} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-orange-700" />
            {uploading ? <p className="mt-1 text-xs text-slate-500">Uploading...</p> : null}
            {uploadNote ? <p className="mt-1 text-xs text-slate-500">{uploadNote}</p> : null}
            {headshotUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={headshotUrl} alt="Your photo" className="mt-2 h-16 w-16 rounded-full object-cover" />
            ) : null}
            <input value={headshotUrl} onChange={(ev) => setHeadshotUrl(ev.target.value)} className={`${inputCls} mt-2`} placeholder="...or paste an image link" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">Your intro</h2>
        <p className="mt-1 text-sm text-slate-500">A short introduction of you and your brand.</p>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="s-earn" className={labelCls}>How do you make money in the online world?</label>
            <textarea id="s-earn" value={introEarn} onChange={(ev) => setIntroEarn(ev.target.value)} rows={2} className={inputCls} />
          </div>
          <div>
            <label htmlFor="s-inspired" className={labelCls}>What inspired you to go down this path?</label>
            <textarea id="s-inspired" value={introInspired} onChange={(ev) => setIntroInspired(ev.target.value)} rows={2} className={inputCls} />
          </div>
          <div>
            <label htmlFor="s-love" className={labelCls}>What do you love most about what you do?</label>
            <textarea id="s-love" value={introLove} onChange={(ev) => setIntroLove(ev.target.value)} rows={2} className={inputCls} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">Your chapter</h2>
        <p className="mt-1 text-sm text-slate-500">
          Expand on your topic: <span className="font-semibold text-slate-700">{initial.topicTitle}</span>. Write it in your own voice. A few paragraphs is perfect.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="s-title" className={labelCls}>Chapter title (optional)</label>
            <input id="s-title" value={chapterTitle} onChange={(ev) => setChapterTitle(ev.target.value)} className={inputCls} placeholder="e.g. 5 storefront tweaks that doubled my clicks" />
          </div>
          <div>
            <label htmlFor="s-body" className={labelCls}>Your chapter<span className="text-orange-600"> *</span></label>
            <textarea id="s-body" value={chapterBody} onChange={(ev) => setChapterBody(ev.target.value)} rows={14} className={inputCls} placeholder="Share your best, most specific advice on your topic..." />
          </div>
          <div>
            <label htmlFor="s-cta" className={labelCls}>A call to action or link for your chapter (optional)</label>
            <input id="s-cta" value={ctaText} onChange={(ev) => setCtaText(ev.target.value)} className={inputCls} placeholder="e.g. Grab my free storefront checklist at ..." />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">Close it out</h2>
        <p className="mt-1 text-sm text-slate-500">Pick one question and answer it to wrap up your chapter.</p>
        <div className="mt-4 space-y-3">
          {CONCLUDING_QUESTIONS.map((q) => (
            <label key={q} className="flex items-start gap-2.5 text-sm text-slate-700">
              <input type="radio" name="conclude" checked={concludeQuestion === q} onChange={() => setConcludeQuestion(q)} className="mt-0.5 h-4 w-4 border-slate-300 text-orange-600 focus:ring-orange-500" />
              <span>{q}</span>
            </label>
          ))}
          <div>
            <label htmlFor="s-answer" className={labelCls}>Your answer</label>
            <textarea id="s-answer" value={concludeAnswer} onChange={(ev) => setConcludeAnswer(ev.target.value)} rows={3} className={inputCls} />
          </div>
        </div>
      </section>

      {status === "error" && message ? <p className="text-sm text-red-600">{message}</p> : null}

      <button
        type="submit"
        disabled={status === "saving"}
        className="inline-flex w-full items-center justify-center rounded-lg bg-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:opacity-60 sm:w-auto"
      >
        {status === "saving" ? "Saving..." : initial.alreadySubmitted ? "Update my chapter" : "Submit my chapter"}
      </button>
    </form>
  );
}
