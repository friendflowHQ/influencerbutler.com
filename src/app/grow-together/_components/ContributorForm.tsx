"use client";

import { useEffect, useMemo, useState } from "react";
import { BUNDLE_TOPICS, formatBundleDate, BUNDLE_DATES, MAX_CONTRIBUTORS } from "../_data/bundleMeta";

/**
 * Contributor application form for the Grow Together Creator Bundle. Fetches live
 * topic availability so a full topic cannot be picked, posts to
 * /api/grow-together/apply, and shows a thank-you state on success. Mirrors the
 * capture/resilience UX of src/app/downloading/GatedDownload.tsx.
 */

type TopicAvailability = {
  slug: string;
  title: string;
  blurb: string;
  capacity: number;
  claimed: number;
  open: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContributorForm() {
  const [topics, setTopics] = useState<TopicAvailability[] | null>(null);
  const [slotsRemaining, setSlotsRemaining] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [website, setWebsite] = useState("");
  const [otherSocial, setOtherSocial] = useState("");
  const [topic, setTopic] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [audience, setAudience] = useState("");
  const [bio, setBio] = useState("");
  const [agree, setAgree] = useState(false);

  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  // Load availability once. If it fails, fall back to the static topic list (all
  // shown as open) so the form still works.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/grow-together/topics", { cache: "no-store" });
        const json = (await res.json()) as {
          topics?: TopicAvailability[];
          slotsRemaining?: number;
        };
        if (!cancelled && json.topics) {
          setTopics(json.topics);
          if (typeof json.slotsRemaining === "number") setSlotsRemaining(json.slotsRemaining);
        }
      } catch {
        if (!cancelled) {
          setTopics(
            BUNDLE_TOPICS.map((t) => ({
              slug: t.slug,
              title: t.title,
              blurb: t.blurb,
              capacity: t.capacity,
              claimed: 0,
              open: true,
            })),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openTopics = useMemo(() => (topics ?? []).filter((t) => t.open), [topics]);
  const selectedBlurb = useMemo(
    () => (topics ?? []).find((t) => t.slug === topic)?.blurb ?? "",
    [topics, topic],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setStatus("error");
      setMessage("Please enter your name.");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setStatus("error");
      setMessage("Please enter a valid email.");
      return;
    }
    if (!topic) {
      setStatus("error");
      setMessage("Please choose a topic.");
      return;
    }
    if (!agree) {
      setStatus("error");
      setMessage("Please confirm you can submit your chapter and help promote at launch.");
      return;
    }

    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("/api/grow-together/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          topic,
          instagramHandle: instagram.trim() || undefined,
          website: website.trim() || undefined,
          otherSocials: otherSocial.trim() ? { other: otherSocial.trim() } : undefined,
          chapterTitle: chapterTitle.trim() || undefined,
          bio: bio.trim() || undefined,
          audienceSize: audience.trim() || undefined,
          agree: true,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setStatus("error");
        setMessage(json.error ?? "Could not save your application. Please retry.");
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("Network error. Please retry.");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center sm:p-8">
        <h3 className="text-xl font-bold text-green-900">You are in. Thank you!</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-green-800">
          Check your inbox for a welcome email with your topic, exactly what to send, and the
          submission deadline ({formatBundleDate(BUNDLE_DATES.submissionDeadline)}). If you do not
          see it in a few minutes, check spam and add us to your contacts.
        </p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";
  const labelCls = "mb-1 block text-sm font-semibold text-slate-800";

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      {slotsRemaining !== null ? (
        <p className="text-sm font-semibold text-orange-700">
          {slotsRemaining > 0
            ? `${slotsRemaining} of ${MAX_CONTRIBUTORS} spots left in this round.`
            : "This round is full. Apply to join the waitlist for the next bundle."}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="gt-name" className={labelCls}>
            Your name<span className="text-orange-600"> *</span>
          </label>
          <input id="gt-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Liz Dean" />
        </div>
        <div>
          <label htmlFor="gt-email" className={labelCls}>
            Email<span className="text-orange-600"> *</span>
          </label>
          <input id="gt-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor="gt-ig" className={labelCls}>
            Instagram handle
          </label>
          <input id="gt-ig" type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)} className={inputCls} placeholder="@yourhandle" />
        </div>
        <div>
          <label htmlFor="gt-audience" className={labelCls}>
            Audience size (roughly)
          </label>
          <input id="gt-audience" type="text" value={audience} onChange={(e) => setAudience(e.target.value)} className={inputCls} placeholder="e.g. 25k on Instagram" />
        </div>
        <div>
          <label htmlFor="gt-website" className={labelCls}>
            Website or storefront
          </label>
          <input id="gt-website" type="text" value={website} onChange={(e) => setWebsite(e.target.value)} className={inputCls} placeholder="yoursite.com" />
        </div>
        <div>
          <label htmlFor="gt-other" className={labelCls}>
            Other social (optional)
          </label>
          <input id="gt-other" type="text" value={otherSocial} onChange={(e) => setOtherSocial(e.target.value)} className={inputCls} placeholder="TikTok, Pinterest, YouTube..." />
        </div>
      </div>

      <div>
        <label htmlFor="gt-topic" className={labelCls}>
          Which topic do you want to write?<span className="text-orange-600"> *</span>
        </label>
        <select id="gt-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className={inputCls}>
          <option value="">Choose an open topic...</option>
          {openTopics.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.title}
            </option>
          ))}
        </select>
        {selectedBlurb ? <p className="mt-1.5 text-xs text-slate-500">{selectedBlurb}</p> : null}
        {topics && openTopics.length === 0 ? (
          <p className="mt-1.5 text-xs text-orange-700">
            Every topic is currently claimed. Apply anyway and we will find you a spot or add you to the next bundle.
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="gt-chapter" className={labelCls}>
          Your angle / chapter title (optional)
        </label>
        <input id="gt-chapter" type="text" value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} className={inputCls} placeholder="e.g. 5 storefront tweaks that doubled my clicks" />
      </div>

      <div>
        <label htmlFor="gt-bio" className={labelCls}>
          Short bio (optional)
        </label>
        <textarea id="gt-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className={inputCls} placeholder="A sentence or two about you and what you are known for." />
      </div>

      <label className="flex items-start gap-2.5 text-sm text-slate-700">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500" />
        <span>
          I can submit my chapter by {formatBundleDate(BUNDLE_DATES.submissionDeadline)} and I will
          help promote the finished bundle to my audience during launch week. I am ok receiving a few
          coordination emails about it.
        </span>
      </label>

      {status === "error" && message ? <p className="text-sm text-red-600">{message}</p> : null}

      <button
        type="submit"
        disabled={status === "sending"}
        className="inline-flex w-full items-center justify-center rounded-lg bg-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:opacity-60 sm:w-auto"
      >
        {status === "sending" ? "Sending..." : "Claim my topic"}
      </button>
    </form>
  );
}
