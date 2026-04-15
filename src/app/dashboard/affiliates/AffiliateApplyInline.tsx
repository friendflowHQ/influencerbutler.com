"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type SocialHandles = {
  instagram: string;
  tiktok: string;
  youtube: string;
  x: string;
  amazonStorefront: string;
};

type SupabaseBrowserClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string | null } | null };
    }>;
  };
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { full_name?: string | null; email?: string | null } | null;
        }>;
      };
    };
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
};

function sanitizeSocials(input: SocialHandles): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const trimmed = value.trim();
    if (trimmed.length > 0) out[key] = trimmed.slice(0, 200);
  }
  return out;
}

export default function AffiliateApplyInline() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [website, setWebsite] = useState("");
  const [audienceSize, setAudienceSize] = useState("");
  const [niche, setNiche] = useState("");
  const [promotionStrategy, setPromotionStrategy] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [socials, setSocials] = useState<SocialHandles>({
    instagram: "",
    tiktok: "",
    youtube: "",
    x: "",
    amazonStorefront: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient() as unknown as SupabaseBrowserClient;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        setUserId(user.id);
        setEmail(user.email ?? "");

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name,email")
          .eq("id", user.id)
          .maybeSingle();

        if (cancelled) return;
        if (profile?.full_name) setFullName(profile.full_name);
        if (!user.email && profile?.email) setEmail(profile.email);
      } catch (err) {
        console.error("AffiliateApplyInline: load user failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSocialChange = (key: keyof SocialHandles, value: string) => {
    setSocials((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!userId) {
      setError("We couldn't verify your account. Please refresh the page and try again.");
      return;
    }
    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!agreedToTerms) {
      setError("Please agree to the affiliate program terms.");
      return;
    }
    if (promotionStrategy.trim().length < 30) {
      setError("Please describe your promotion strategy in at least 30 characters.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient() as unknown as SupabaseBrowserClient;
      const normalizedEmail = (email || "").trim().toLowerCase();

      const { error: upsertError } = await supabase
        .from("affiliate_applications")
        .upsert(
          {
            user_id: userId,
            email: normalizedEmail,
            full_name: fullName.trim(),
            website: website.trim() || null,
            social_handles: sanitizeSocials(socials),
            audience_size: audienceSize.trim() || null,
            niche: niche.trim() || null,
            promotion_strategy: promotionStrategy.trim(),
            agreed_to_terms: true,
            status: "pending",
          },
          { onConflict: "user_id" },
        );

      if (upsertError) {
        setLoading(false);
        setError(`Couldn't save your application: ${upsertError.message}`);
        return;
      }

      void fetch("/api/affiliates/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, fullName: fullName.trim(), email: normalizedEmail }),
      }).catch(() => undefined);

      router.refresh();
    } catch (err) {
      console.error("Inline affiliate apply failed", err);
      setLoading(false);
      const message = err instanceof Error ? err.message : "Network error. Please try again.";
      setError(message);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Affiliate program
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Earn 35% recurring — for life.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Tell us a bit about your audience and how you&apos;d promote Influencer Butler. Applications are
          reviewed weekly, and you&apos;ll hear back via email either way.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              About you
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" required>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  readOnly
                  className={`${inputClass} bg-slate-50 text-slate-500`}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              About your audience
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Website or main channel">
                <input
                  type="url"
                  placeholder="https://"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Audience size" hint="e.g. 25k TikTok, 5k newsletter">
                <input
                  value={audienceSize}
                  onChange={(e) => setAudienceSize(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Niche" hint="e.g. Amazon Influencers, creator tools, affiliate marketing">
              <input value={niche} onChange={(e) => setNiche(e.target.value)} className={inputClass} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Instagram handle">
                <input
                  placeholder="@yourhandle"
                  value={socials.instagram}
                  onChange={(e) => handleSocialChange("instagram", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="TikTok handle">
                <input
                  placeholder="@yourhandle"
                  value={socials.tiktok}
                  onChange={(e) => handleSocialChange("tiktok", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="YouTube channel">
                <input
                  value={socials.youtube}
                  onChange={(e) => handleSocialChange("youtube", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="X / Twitter">
                <input
                  placeholder="@yourhandle"
                  value={socials.x}
                  onChange={(e) => handleSocialChange("x", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Amazon storefront">
                <input
                  value={socials.amazonStorefront}
                  onChange={(e) => handleSocialChange("amazonStorefront", e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Promotion plan
            </legend>
            <Field
              label="How do you plan to promote Influencer Butler?"
              required
              hint="A few sentences is plenty — share what your audience looks like and how you plan to talk about us."
            >
              <textarea
                required
                rows={5}
                value={promotionStrategy}
                onChange={(e) => setPromotionStrategy(e.target.value)}
                className={`${inputClass} resize-y`}
              />
            </Field>
          </fieldset>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#f97316]"
            />
            <span>
              I agree to promote Influencer Butler honestly, not bid on branded keywords, not run
              incentivized or misleading promotions, and to follow the affiliate terms.
            </span>
          </label>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading || !userId}
            className="w-full rounded-xl bg-[#f97316] px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#ea580c] disabled:opacity-60 sm:w-auto"
          >
            {loading ? "Submitting..." : "Submit application"}
          </button>
        </form>
      </section>

      <ol className="grid gap-3 sm:grid-cols-3">
        <Step n={1} title="Apply" body="Share a bit about your audience and promotion plan." />
        <Step
          n={2}
          title="Get approved"
          body="We review weekly and email you a decision, usually within 48 hours."
        />
        <Step
          n={3}
          title="Earn forever"
          body="Your unique link appears here. Earn 35% on every monthly payment — for life."
        />
      </ol>
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20";

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-1 text-[#f97316]">*</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#f97316]">Step {n}</p>
      <p className="mt-1 font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
    </li>
  );
}
