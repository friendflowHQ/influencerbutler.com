"use client";

import Link from "next/link";
import Image from "next/image";
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
    signUp: (args: {
      email: string;
      password: string;
      options?: { data?: Record<string, unknown>; emailRedirectTo?: string };
    }) => Promise<{
      data: { user: { id: string } | null };
      error: { message: string } | null;
    }>;
    signInWithPassword: (args: {
      email: string;
      password: string;
    }) => Promise<{
      data: { user: { id: string } | null };
      error: { message: string } | null;
    }>;
  };
  from: (table: string) => {
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

export default function AffiliateApplyPage() {
  const router = useRouter();

  // Signed-in users get the inline dashboard form — no need to create another
  // account. Send them to the consolidated affiliate dashboard.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient() as unknown as SupabaseBrowserClient;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!cancelled && user) {
          router.replace("/dashboard/affiliates");
        }
      } catch {
        // Ignore — treat as signed-out and let them use the public form.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const handleSocialChange = (key: keyof SocialHandles, value: string) => {
    setSocials((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

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
      const normalizedEmail = email.trim().toLowerCase();

      // 1) Create the Supabase account (client-side — Vercel serverless has
      //    intermittent DNS issues reaching Supabase from the server).
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        },
      });

      if (signUpError) {
        setLoading(false);
        setError(signUpError.message);
        return;
      }

      const userId = signUpData.user?.id ?? null;

      // 2) Try to sign in immediately — works when email confirmation is off.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      const requiresEmailConfirmation = Boolean(signInError);

      // 3) Save the application row. RLS allows auth.uid() = user_id, so this
      //    only works once signed in. If email confirmation is required we
      //    still complete the flow (user can confirm and return later).
      if (!requiresEmailConfirmation && userId) {
        const { error: upsertError } = await supabase
          .from("affiliate_applications")
          .upsert(
            {
              user_id: userId,
              email: normalizedEmail,
              full_name: fullName,
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
          setError(
            `Account created, but we couldn't save your application: ${upsertError.message}. Please log in and retry.`,
          );
          return;
        }

        // 4) Fire-and-forget admin email notification.
        void fetch("/api/affiliates/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, fullName, email: normalizedEmail }),
        }).catch(() => undefined);
      }

      const qs = requiresEmailConfirmation ? "?confirm=1" : "";
      router.push(`/affiliates/apply/thanks${qs}`);
    } catch (err) {
      console.error("Affiliate apply failed", err);
      setLoading(false);
      const message = err instanceof Error ? err.message : "Network error. Please try again.";
      setError(message);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-3xl px-6">
        <Link
          href="/affiliates"
          className="text-sm font-medium text-slate-500 hover:text-[#f97316]"
        >
          ← Back to affiliate program
        </Link>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="flex items-center gap-3">
            <Image
              src="/assets/influencer-butler-logo.png"
              alt="Influencer Butler logo"
              width={40}
              height={40}
              className="rounded-md"
              priority
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
                Affiliate application
              </p>
              <p className="text-sm text-slate-500">Apply in about 2 minutes.</p>
            </div>
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">Let&apos;s get you earning 35%.</h1>
          <p className="mt-2 text-sm text-slate-600">
            We review applications weekly and approve creators whose audience actually benefits from Influencer
            Butler. You&apos;ll get a confirmation email either way.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                Your account
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
                <Field label="Email" required>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field
                label="Password"
                required
                hint="Used to log in to your affiliate portal."
              >
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </Field>
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
                <input
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  className={inputClass}
                />
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
              disabled={loading}
              className="w-full rounded-xl bg-[#f97316] px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#ea580c] disabled:opacity-60"
            >
              {loading ? "Submitting..." : "Submit application"}
            </button>

            <p className="text-center text-sm text-slate-500">
              Already approved?{" "}
              <Link
                href="/login?next=/dashboard/affiliates"
                className="font-medium text-[#f97316] hover:text-[#ea580c]"
              >
                Log in
              </Link>
            </p>
          </form>
        </section>
      </div>
    </main>
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
