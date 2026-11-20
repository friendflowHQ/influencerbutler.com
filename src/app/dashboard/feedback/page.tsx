"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MyReviewCard, { type MyReview } from "@/components/dashboard/MyReviewCard";

type SubmitState = "idle" | "saving" | "done" | "error";

const PHOTO_ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"];
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const BODY_MAX = 1200;
const DRAFT_KEY = "ib-testimonial-draft";

// Starter prompts: specific, numeric reviews convert best, so steer toward them.
const PROMPTS: Array<{ label: string; starter: string }> = [
  { label: "What I was struggling with", starter: "Before Influencer Butler, I was struggling with " },
  { label: "What changed", starter: "Since using it, " },
  { label: "My result (numbers help)", starter: "In my first month I " },
];

function ratingHeadline(n: number): string {
  if (n >= 5) return "Wonderful. What stood out?";
  if (n === 4) return "Glad it is working. What would make it a 5?";
  if (n === 3) return "Thanks for being honest. What could be better?";
  return "Sorry it fell short. Tell us what went wrong so we can fix it.";
}

function Stars({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="text-3xl leading-none transition-colors"
          style={{ color: n <= active ? "#f59e0b" : "#d1d5db" }}
        >
          {"★"}
        </button>
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [rating, setRating] = useState(0);
  const [quote, setQuote] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [consent, setConsent] = useState(true);

  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [myReview, setMyReview] = useState<MyReview | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fromEmail = useRef(false);
  const draftReady = useRef(false);

  // Restore an unsent draft (and note whether the visit came from the email ask).
  useEffect(() => {
    try {
      fromEmail.current = new URLSearchParams(window.location.search).get("src") === "email";
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { rating?: number; quote?: string; name?: string; role?: string };
        if (typeof d.rating === "number" && d.rating >= 1 && d.rating <= 5) setRating(d.rating);
        if (typeof d.quote === "string") setQuote(d.quote.slice(0, BODY_MAX));
        if (typeof d.name === "string" && d.name) setName(d.name);
        if (typeof d.role === "string") setRole(d.role);
      }
    } catch {
      // storage unavailable: the form still works without drafts
    }
    draftReady.current = true;
  }, []);

  useEffect(() => {
    if (!draftReady.current) return;
    try {
      if (rating || quote) {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ rating, quote, name, role }));
      }
    } catch {
      // ignore
    }
  }, [rating, quote, name, role]);

  const addPrompt = (starter: string) => {
    setQuote((q) => {
      if (q.includes(starter)) return q;
      const next = q.trim() ? `${q.trimEnd()}\n\n${starter}` : starter;
      return next.slice(0, BODY_MAX);
    });
  };

  const loadMyReview = useCallback(async () => {
    try {
      const res = await fetch("/api/testimonials/mine", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { testimonial?: MyReview | null };
      setMyReview(json.testimonial ?? null);
    } catch {
      // best-effort: page works without the status card
    }
  }, []);

  useEffect(() => {
    void loadMyReview();
  }, [loadMyReview]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!alive) return;
        if (!user) {
          setLoading(false);
          return;
        }
        setUserId(user.id);
        // Prefill the display name from the profile (best-effort, own row via RLS).
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name,full_name")
          .eq("id", user.id)
          .maybeSingle();
        const prefill =
          (profile?.display_name as string | null) ||
          (profile?.full_name as string | null) ||
          "";
        if (alive && prefill) setName((prev) => prev || prefill);
      } catch (err) {
        console.error("feedback prefill failed", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const handlePhoto = useCallback(
    async (file: File) => {
      if (!userId) return;
      setPhotoError(null);
      if (!PHOTO_ALLOWED_MIME.includes(file.type)) {
        setPhotoError("Choose a PNG, JPEG, or WEBP image.");
        return;
      }
      if (file.size > PHOTO_MAX_BYTES) {
        setPhotoError("Image must be under 8 MB.");
        return;
      }
      setPhotoUploading(true);
      try {
        const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${userId}/photo-${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("testimonials")
          .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
        if (uploadErr) throw uploadErr;
        const { data: pub } = supabase.storage.from("testimonials").getPublicUrl(path);
        setPhotoUrl(pub.publicUrl);
      } catch (err) {
        console.error("testimonial photo upload failed", err);
        setPhotoError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setPhotoUploading(false);
      }
    },
    [supabase, userId],
  );

  const canSubmit =
    !loading &&
    !!userId &&
    rating >= 1 &&
    quote.trim().length >= 10 &&
    name.trim().length > 0 &&
    state !== "saving";

  const submit = async () => {
    if (!canSubmit) return;
    setState("saving");
    setError(null);
    try {
      const res = await fetch("/api/testimonials/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          body: quote.trim(),
          authorName: name.trim(),
          authorRole: role.trim() || null,
          photoUrl,
          source: fromEmail.current ? "email" : "in_app",
        }),
      });
      const json = (await res.json()) as { ok?: boolean; published?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        setState("error");
        return;
      }
      setPublished(json.published === true);
      setState("done");
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
      void loadMyReview();
    } catch {
      setError("Network error. Please try again.");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-2 py-10">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="text-4xl">{"💛"}</div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">Thank you.</h1>
          <p className="mt-2 text-slate-600">
            {published
              ? "Your review is live on our site. We really appreciate you taking the time."
              : "Your review is in and our team will take a look shortly. Thank you for sharing."}
          </p>
        </div>
        {myReview ? <MyReviewCard review={myReview} /> : null}
      </div>
    );
  }

  // Already submitted and not writing a new one: show the status card instead
  // of the blank form, with the option to add a fresh review.
  if (myReview && !showForm) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-2 py-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your feedback</h1>
          <p className="mt-1 text-sm text-slate-600">
            Thanks for sharing your experience. Here is where your review stands.
          </p>
        </div>
        <MyReviewCard review={myReview} />
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Write a new review
        </button>
      </div>
    );
  }

  const previewName = name.trim() || "Your name";
  const previewInitial = name.trim() ? name.trim()[0].toUpperCase() : "?";

  return (
    <div className="mx-auto max-w-2xl px-2 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Share your experience</h1>
      <p className="mt-1 text-sm text-slate-600">
        Two minutes of your time helps other creators decide, and it means a lot to our small team.
        Approved reviews appear on our homepage.
      </p>

      <div className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="block text-sm font-semibold text-slate-800">
            How would you rate Influencer Butler?
          </p>
          <div className="mt-2">
            <Stars value={rating} onChange={setRating} />
          </div>
          {rating >= 1 ? (
            <p className="mt-2 text-sm text-slate-600">{ratingHeadline(rating)}</p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Tap a star to get started.</p>
          )}
        </div>

        {rating >= 1 ? (
          <>
            <div>
              <label htmlFor="tm-quote" className="block text-sm font-semibold text-slate-800">
                Your review
              </label>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Starter prompts">
                {PROMPTS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => addPrompt(p.starter)}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    + {p.label}
                  </button>
                ))}
              </div>
              <textarea
                id="tm-quote"
                value={quote}
                onChange={(e) => setQuote(e.target.value.slice(0, BODY_MAX))}
                rows={5}
                placeholder="What has Influencer Butler helped you do? Be specific: the more real, the better."
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
              <p className="mt-1 flex justify-between text-xs text-slate-500">
                <span>{quote.trim().length < 10 ? "A sentence or two is plenty (10+ characters)." : " "}</span>
                <span>
                  {quote.length}/{BODY_MAX}
                </span>
              </p>
            </div>

            <div>
              <label htmlFor="tm-name" className="block text-sm font-semibold text-slate-800">
                Name to show
              </label>
              <input
                id="tm-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarah M."
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>

            <details className="rounded-lg border border-slate-200 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                Add a title or photo <span className="font-normal text-slate-500">(optional)</span>
              </summary>
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="tm-role" className="block text-sm font-semibold text-slate-800">
                    Your title
                  </label>
                  <input
                    id="tm-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. Amazon Influencer"
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                </div>
                <div>
                  <span className="block text-sm font-semibold text-slate-800">Photo</span>
                  <div className="mt-2 flex items-center gap-3">
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoUrl}
                        alt="Your uploaded headshot"
                        className="h-14 w-14 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        {previewInitial}
                      </div>
                    )}
                    <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 focus-within:ring-2 focus-within:ring-orange-400 hover:bg-slate-50">
                      {photoUploading ? "Uploading..." : photoUrl ? "Change photo" : "Add a photo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        disabled={photoUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handlePhoto(f);
                        }}
                      />
                    </label>
                    {photoUrl ? (
                      <button
                        type="button"
                        onClick={() => setPhotoUrl(null)}
                        className="text-sm text-slate-600 underline-offset-2 hover:underline"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  {photoError ? <p className="mt-1 text-sm text-rose-700">{photoError}</p> : null}
                </div>
              </div>
            </details>

            {/* Live preview: what the homepage card will look like. */}
            <div>
              <p className="text-sm font-semibold text-slate-800">How it will look on our homepage</p>
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white font-semibold text-slate-500">
                      {previewInitial}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{previewName}</p>
                    {role.trim() ? <p className="truncate text-xs text-slate-500">{role.trim()}</p> : null}
                  </div>
                  <span className="ml-auto text-amber-500" aria-label={`${rating} of 5 stars`}>
                    {"★".repeat(rating)}
                    <span className="text-slate-300">{"★".repeat(5 - rating)}</span>
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
                  {quote.trim() ? `“${quote.trim()}”` : "Your words will appear here as you type."}
                </p>
              </div>
              <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  Yes, show this review (with my name, title and photo) on the Influencer Butler website
                  and marketing.
                </span>
              </label>
            </div>

            {error ? <p className="text-sm text-rose-700">{error}</p> : null}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit || !consent}
                className="rounded-lg bg-orange-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-800 disabled:opacity-50"
              >
                {state === "saving" ? "Sending..." : "Submit review"}
              </button>
              <span className="text-xs text-slate-500">
                {!consent
                  ? "Tick the box above to submit."
                  : "Your draft is saved on this device until you send it."}
              </span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
