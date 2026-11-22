"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COUNTRIES } from "@/lib/countries";
import NegotiateTermsNote from "@/components/NegotiateTermsNote";
import {
  AudienceFields,
  EMPTY_AUDIENCE,
  Field,
  inputClass,
  inputErrorClass,
  isValidEmail,
  isValidUrl,
  normalizeUrl,
  resolveNiche,
  sanitizeSocials,
  type AudienceValue,
} from "./ApplyFields";

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

/** A throwaway strong password for people who skip the optional password field.
 *  They sign in with an emailed link instead (and can set a password later). */
function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const MIN_STRATEGY = 30;

export default function AffiliateApplyPage() {
  const router = useRouter();

  // Signed-in users get the inline dashboard form - no need to create another
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
        // Ignore - treat as signed-out and let them use the public form.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [audience, setAudience] = useState<AudienceValue>(EMPTY_AUDIENCE);
  const [promotionStrategy, setPromotionStrategy] = useState("");
  const [country, setCountry] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  const setFieldError = (key: string, message: string | null) =>
    setErrors((prev) => ({ ...prev, [key]: message }));

  const validateEmail = () => {
    const msg = !email.trim()
      ? "Enter your email."
      : !isValidEmail(email)
        ? "That email doesn't look right. Check for typos."
        : null;
    setFieldError("email", msg);
    return msg === null;
  };
  const validateName = () => {
    const msg = fullName.trim() ? null : "Enter your full name.";
    setFieldError("fullName", msg);
    return msg === null;
  };
  const validatePassword = () => {
    const msg = password && password.length < 6 ? "Use at least 6 characters, or leave it blank." : null;
    setFieldError("password", msg);
    return msg === null;
  };
  const validateWebsite = () => {
    const msg = isValidUrl(audience.website) ? null : "That doesn't look like a link. Try yoursite.com.";
    setFieldError("website", msg);
    return msg === null;
  };
  const validateStrategy = () => {
    const len = promotionStrategy.trim().length;
    const msg = len >= MIN_STRATEGY ? null : `Add a little more detail (${MIN_STRATEGY - len} more characters).`;
    setFieldError("strategy", msg);
    return msg === null;
  };
  const validateCountry = () => {
    const msg = country ? null : "Pick your country so we can route the right tax form to you.";
    setFieldError("country", msg);
    return msg === null;
  };

  const goToStep = (next: 1 | 2) => {
    setStep(next);
    // Move focus to the new step's heading so keyboard and screen reader users land on it.
    window.setTimeout(() => stepHeadingRef.current?.focus(), 0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleContinue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const ok = [validateName(), validateEmail(), validatePassword()].every(Boolean);
    if (ok) goToStep(2);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const ok = [validateWebsite(), validateCountry(), validateStrategy()].every(Boolean);
    if (!ok) return;
    if (!agreedToTerms) {
      setError("Please agree to the Affiliate Program Terms.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient() as unknown as SupabaseBrowserClient;
      const normalizedEmail = email.trim().toLowerCase();
      const hasPassword = password.length > 0;
      const effectivePassword = hasPassword ? password : randomPassword();

      // 1) Create the Supabase account (client-side - Vercel serverless has
      //    intermittent DNS issues reaching Supabase from the server).
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: effectivePassword,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        },
      });

      if (signUpError) {
        setLoading(false);
        setError(signUpError.message);
        return;
      }

      const userId = signUpData.user?.id ?? null;

      // 2) Try to sign in immediately - works when email confirmation is off.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: effectivePassword,
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
              full_name: fullName.trim(),
              website: normalizeUrl(audience.website) || null,
              social_handles: sanitizeSocials(audience),
              audience_size: audience.audienceSize || null,
              niche: resolveNiche(audience) || null,
              promotion_strategy: promotionStrategy.trim(),
              country: country || null,
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

        // 4) Fire-and-forget notifications (admin alert + applicant confirmation).
        void fetch("/api/affiliates/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, fullName: fullName.trim(), email: normalizedEmail }),
        }).catch(() => undefined);
      }

      const qs = new URLSearchParams();
      if (requiresEmailConfirmation) qs.set("confirm", "1");
      if (!hasPassword) qs.set("np", "1");
      const query = qs.toString();
      router.push(`/affiliates/apply/thanks${query ? `?${query}` : ""}`);
    } catch (err) {
      console.error("Affiliate apply failed", err);
      setLoading(false);
      const message = err instanceof Error ? err.message : "Network error. Please try again.";
      setError(message);
    }
  };

  const stepLabels = ["Your account", "Your audience"];

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/affiliates" className="text-sm font-medium text-slate-600 hover:text-[#c2410c]">
          ← Back to affiliate program
        </Link>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 lg:p-10">
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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c2410c]">
                Affiliate application
              </p>
              <p className="text-sm text-slate-600">Free to apply. About 2 minutes.</p>
            </div>
          </div>

          <ol className="mt-6 flex items-center gap-3" aria-label="Application progress">
            {stepLabels.map((label, i) => {
              const n = i + 1;
              const active = step === n;
              const done = step > n;
              return (
                <li
                  key={label}
                  aria-current={active ? "step" : undefined}
                  className="flex flex-1 items-center gap-2"
                >
                  <span
                    className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold ${
                      active || done ? "bg-[#c2410c] text-white" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {done ? "✓" : n}
                  </span>
                  <span className={`text-sm ${active ? "font-semibold text-slate-900" : "text-slate-600"}`}>
                    {`Step ${n} of 2: ${label}`}
                  </span>
                  {n < 2 ? <span className="hidden h-px flex-1 bg-slate-200 sm:block" aria-hidden="true" /> : null}
                </li>
              );
            })}
          </ol>

          <h1
            ref={stepHeadingRef}
            tabIndex={-1}
            className="mt-6 text-2xl font-semibold tracking-tight outline-none sm:text-3xl"
          >
            {step === 1 ? "Let's get you earning 30%." : "Tell us about your audience."}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {step === 1
              ? "Start with the basics. Your link and code go live the moment you are approved."
              : "A few quick details so we can approve you fast. Most applications get a decision within a day, and you'll get an email either way. Applying never costs anything."}
          </p>

          {step === 1 ? (
            <form onSubmit={handleContinue} noValidate className="mt-8 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" required error={errors.fullName}>
                  <input
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    onBlur={validateName}
                    aria-invalid={errors.fullName ? true : undefined}
                    className={`${inputClass} ${errors.fullName ? inputErrorClass : ""}`}
                  />
                </Field>
                <Field label="Email" required error={errors.email}>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={validateEmail}
                    aria-invalid={errors.email ? true : undefined}
                    className={`${inputClass} ${errors.email ? inputErrorClass : ""}`}
                  />
                </Field>
              </div>

              <Field
                label="Password"
                optional
                hint="Skip it and we'll email you a sign-in link instead. You can set a password any time."
                error={errors.password}
              >
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={validatePassword}
                    aria-invalid={errors.password ? true : undefined}
                    className={`${inputClass} pr-16 ${errors.password ? inputErrorClass : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-2 mt-1 flex items-center rounded px-2 text-xs font-semibold text-slate-700 hover:text-[#c2410c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c2410c]"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </Field>

              {error ? (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-xl bg-[#c2410c] px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#9a3412]"
              >
                Continue
              </button>

              <p className="text-center text-sm text-slate-600">
                Already approved?{" "}
                <Link
                  href="/login?next=/dashboard/affiliates"
                  className="font-medium text-[#c2410c] hover:text-[#9a3412]"
                >
                  Log in
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-6">
              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold uppercase tracking-wider text-slate-600">
                  About your audience
                </legend>
                <AudienceFields value={audience} onChange={setAudience} errors={{ website: errors.website }} />
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold uppercase tracking-wider text-slate-600">
                  Where you&apos;re based
                </legend>
                <Field
                  label="Country"
                  required
                  hint="We use this to give you the right tax form (W-9 for US, W-8BEN otherwise) in your dashboard."
                  error={errors.country}
                >
                  <select
                    required
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    onBlur={validateCountry}
                    aria-invalid={errors.country ? true : undefined}
                    className={`${inputClass} ${errors.country ? inputErrorClass : ""}`}
                  >
                    <option value="">Select a country</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold uppercase tracking-wider text-slate-600">
                  Promotion plan
                </legend>
                <Field
                  label="How do you plan to promote Influencer Butler?"
                  required
                  hint={`A few sentences is plenty: who your audience is and how you'd talk about us. (${Math.min(
                    promotionStrategy.trim().length,
                    MIN_STRATEGY,
                  )}/${MIN_STRATEGY} characters minimum)`}
                  error={errors.strategy}
                >
                  <textarea
                    required
                    rows={5}
                    value={promotionStrategy}
                    onChange={(e) => setPromotionStrategy(e.target.value)}
                    onBlur={validateStrategy}
                    aria-invalid={errors.strategy ? true : undefined}
                    className={`${inputClass} resize-y ${errors.strategy ? inputErrorClass : ""}`}
                  />
                </Field>
              </fieldset>

              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-[#c2410c]"
                />
                <span>
                  I agree to the{" "}
                  <Link
                    href="/legal/affiliate-terms"
                    target="_blank"
                    rel="noopener"
                    className="font-medium text-[#c2410c] hover:text-[#9a3412] underline underline-offset-2"
                  >
                    Affiliate Program Terms
                  </Link>{" "}
                  and understand that I complete my tax form (W-9 or W-8BEN) in my dashboard and that
                  Influencer Butler pays my commissions directly via PayPal.
                </span>
              </label>

              <NegotiateTermsNote />

              {error ? (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => goToStep(1)}
                  disabled={loading}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-700 transition hover:border-[#c2410c] hover:text-[#c2410c] disabled:opacity-60"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-xl bg-[#c2410c] px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#9a3412] disabled:opacity-60"
                >
                  {loading ? "Submitting..." : "Submit application"}
                </button>
              </div>

              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">What happens next</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>You get a confirmation email right away.</li>
                  <li>We review your application, usually within a day, and email you a decision.</li>
                  <li>Once approved, your branded code and tracked link are live in your dashboard.</li>
                </ol>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
