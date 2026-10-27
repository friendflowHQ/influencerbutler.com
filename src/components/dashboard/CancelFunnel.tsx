"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  REASONS,
  WOULD_RETURN_OPTIONS,
  offersFeatureAsk,
  type Reason,
  type WouldReturn,
} from "@/lib/cancel-reasons-shared";

type OfferType = "monthly_50_off_3mo" | "yearly_20_off_1yr" | null;

type VariantPriceResponse = {
  priceCents: number;
  currency: string;
  interval: string;
  intervalCount: number;
  offerType: OfferType;
  offerPercent: number;
  offerDurationMonths: number;
  currentFormatted: string;
  discountedFormatted: string | null;
  totalSavingsFormatted: string | null;
  nextChargeFormatted: string | null;
};

type OfferResponse = {
  ok: boolean;
  applied: boolean;
  discountCode: string;
  customerPortalUrl: string | null;
  offerPercent: number;
  durationInMonths: number;
  discountedPriceFormatted: string;
  nextChargeFormatted: string;
};

type FeatureOfferResponse = {
  ok: boolean;
  applied: boolean;
  discountCode: string;
  customerPortalUrl: string | null;
  freeMonths: number;
  nextChargeFormatted: string;
};

type CancelFunnelProps = {
  subscriptionId: string;
  variantId: string | null;
  renewsAt: string | null;
  onClose: () => void;
  onCancelled: () => void;
  onOfferAccepted: () => void;
  onPaused: () => void;
};

type Step = 1 | 2 | 3 | 4 | 5 | "pause";
type Terminal = "cancelled" | "offer_accepted" | "feature_offer_accepted" | "paused";
type PauseMonths = 1 | 2 | 3;

// Step 4 (percent-off retention discount) is intentionally skipped in the user
// flow: active paying subscribers should not be shown competing promo
// discounts. The Step4Offer component and /api/subscription/retention-offer
// route are kept in place so that discount offer can be re-wired later
// without re-implementing it.
//
// Step 4 IS reached for "missing_features"/"technical_issues" reasons, but it
// renders a different component (Step4FeatureOffer): an ask for what they
// need + a fixed 2-months-free offer, via /api/subscription/feature-retention-offer.
const TOTAL_STEPS = 4;

function formatDate(value: string | null): string {
  if (!value) return "the end of your current period";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "the end of your current period";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function CancelFunnel({
  subscriptionId,
  variantId,
  renewsAt,
  onClose,
  onCancelled,
  onOfferAccepted,
  onPaused,
}: CancelFunnelProps) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [reason, setReason] = useState<Reason | null>(null);
  const [feedback, setFeedback] = useState("");
  const [intendedOutcome, setIntendedOutcome] = useState("");
  const [wouldReturn, setWouldReturn] = useState<WouldReturn | null>(null);
  const [featureAsk, setFeatureAsk] = useState("");
  const [pauseMonths, setPauseMonths] = useState<PauseMonths>(1);
  const [pauseResumesAt, setPauseResumesAt] = useState<string | null>(null);
  // Remembers which screen to go "Back" to from the pause picker, since it can
  // be opened from either the intro or the final-confirm screen.
  const [pauseOpenedFrom, setPauseOpenedFrom] = useState<Step>(1);

  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [price, setPrice] = useState<VariantPriceResponse | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [offerResult, setOfferResult] = useState<OfferResponse | null>(null);
  const [featureOfferResult, setFeatureOfferResult] = useState<FeatureOfferResponse | null>(
    null,
  );

  const showFeatureOffer = offersFeatureAsk(reason);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !actionLoading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, actionLoading]);

  // Fetch live variant pricing when entering step 4 - but only for the percent-off
  // discount screen (Step4Offer). The feature-offer screen is a fixed 2-months-free
  // offer with no pricing lookup, so skip the fetch entirely when it's the one showing.
  useEffect(() => {
    if (step !== 4 || price || !variantId || showFeatureOffer) return;

    let cancelled = false;
    setPriceLoading(true);
    setPriceError(null);

    fetch(`/api/subscription/variant-price?variantId=${encodeURIComponent(variantId)}`)
      .then(async (res) => {
        const payload = (await res.json()) as
          | VariantPriceResponse
          | { error?: string };
        if (!res.ok) {
          throw new Error(
            ("error" in payload && payload.error) || "Could not load pricing",
          );
        }
        if (!cancelled) setPrice(payload as VariantPriceResponse);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPriceError(err instanceof Error ? err.message : "Could not load pricing");
        }
      })
      .finally(() => {
        if (!cancelled) setPriceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [step, price, variantId, showFeatureOffer]);

  const handleAcceptOffer = async () => {
    if (!variantId) return;
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch("/api/subscription/retention-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId,
          variantId,
          reason: reason ?? "retention_offer_accepted",
          feedback: feedback.trim() || null,
        }),
      });
      const payload = (await res.json()) as OfferResponse | { error?: string };

      if (!res.ok) {
        throw new Error(
          ("error" in payload && payload.error) || "Could not apply discount",
        );
      }

      setOfferResult(payload as OfferResponse);
      setTerminal("offer_accepted");
      onOfferAccepted();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not apply discount");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptFeatureOffer = async () => {
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch("/api/subscription/feature-retention-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId,
          variantId,
          reason,
          offerFeedback: featureAsk.trim() || null,
        }),
      });
      const payload = (await res.json()) as FeatureOfferResponse | { error?: string };

      if (!res.ok) {
        throw new Error(("error" in payload && payload.error) || "Could not apply offer");
      }

      setFeatureOfferResult(payload as FeatureOfferResponse);
      setTerminal("feature_offer_accepted");
      onOfferAccepted();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not apply offer");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch("/api/subscription/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, months: pauseMonths }),
      });

      const payload = (await res.json()) as { resumesAt?: string; error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Could not pause subscription");
      }

      setPauseResumesAt(payload.resumesAt ?? null);
      setTerminal("paused");
      onPaused();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not pause subscription");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId,
          reason: reason ?? "unspecified",
          feedback: feedback.trim() || null,
          intendedOutcome: intendedOutcome.trim() || null,
          wouldReturn: wouldReturn ?? null,
          offerFeedback: featureAsk.trim() || null,
          offerShown: showFeatureOffer || price !== null,
        }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Could not cancel subscription");
      }

      setTerminal("cancelled");
      onCancelled();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setActionLoading(false);
    }
  };

  if (!mounted) return null;

  // Internal step state still uses the original 1-5 numbering so the dead
  // Step4Offer branch can be re-wired without renumbering. Visually, step 5
  // (final confirm) maps to position 4 of 4. The pause picker is a side trip,
  // not part of this numbering, so it has no progress value of its own.
  const progressValue =
    terminal && terminal !== "paused" ? TOTAL_STEPS : step === 5 ? 4 : step === "pause" ? 1 : step;
  const showProgress = !terminal && step !== "pause";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        onClick={() => {
          if (!actionLoading) onClose();
        }}
        aria-label="Close cancel funnel"
      />

      <div className="relative w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              {terminal === "cancelled"
                ? "Subscription cancelled"
                : terminal === "offer_accepted"
                ? "Discount applied"
                : terminal === "feature_offer_accepted"
                ? "You're all set"
                : terminal === "paused"
                ? "Subscription paused"
                : step === "pause"
                ? "Pause subscription"
                : "Cancel subscription"}
            </h2>
            {showProgress ? (
              <span className="text-xs font-medium text-slate-400">
                Step {progressValue} of {TOTAL_STEPS}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!actionLoading) onClose();
            }}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Close"
            disabled={actionLoading}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        {showProgress ? (
          <div className="h-1 w-full bg-slate-100">
            <div
              className="h-1 bg-[#f97316] transition-all"
              style={{ width: `${(progressValue / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        ) : null}

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
          {terminal === "cancelled" ? (
            <TerminalCancelled renewsAt={renewsAt} onDone={onClose} />
          ) : terminal === "offer_accepted" ? (
            <TerminalOfferAccepted result={offerResult} onDone={onClose} />
          ) : terminal === "feature_offer_accepted" ? (
            <TerminalFeatureOfferAccepted result={featureOfferResult} onDone={onClose} />
          ) : terminal === "paused" ? (
            <TerminalPaused resumesAt={pauseResumesAt} onDone={onClose} />
          ) : step === "pause" ? (
            <StepPause
              months={pauseMonths}
              onMonthsChange={setPauseMonths}
              actionLoading={actionLoading}
              actionError={actionError}
              onBack={() => setStep(pauseOpenedFrom)}
              onConfirm={handlePause}
            />
          ) : step === 1 ? (
            <Step1Intro
              onContinue={() => setStep(2)}
              onKeep={onClose}
              onPause={() => {
                setPauseOpenedFrom(1);
                setStep("pause");
              }}
            />
          ) : step === 2 ? (
            <Step2Reason
              reason={reason}
              feedback={feedback}
              intendedOutcome={intendedOutcome}
              wouldReturn={wouldReturn}
              onReason={setReason}
              onFeedback={setFeedback}
              onIntendedOutcome={setIntendedOutcome}
              onWouldReturn={setWouldReturn}
              onBack={() => setStep(1)}
              onContinue={() => setStep(3)}
            />
          ) : step === 3 ? (
            <Step3Address
              reason={reason}
              onBack={() => setStep(2)}
              onContinue={() => setStep(showFeatureOffer ? 4 : 5)}
              onKeep={onClose}
            />
          ) : step === 4 && showFeatureOffer ? (
            <Step4FeatureOffer
              reason={reason}
              value={featureAsk}
              onChange={setFeatureAsk}
              actionLoading={actionLoading}
              actionError={actionError}
              onBack={() => setStep(3)}
              onAccept={handleAcceptFeatureOffer}
              onDecline={() => setStep(5)}
            />
          ) : step === 4 ? (
            <Step4Offer
              loading={priceLoading}
              error={priceError}
              price={price}
              actionLoading={actionLoading}
              actionError={actionError}
              onBack={() => setStep(3)}
              onAccept={handleAcceptOffer}
              onDecline={() => setStep(5)}
            />
          ) : (
            <Step5FinalConfirm
              renewsAt={renewsAt}
              actionLoading={actionLoading}
              actionError={actionError}
              onBack={() => setStep(3)}
              onKeep={onClose}
              onConfirm={handleConfirmCancel}
              onPause={() => {
                setPauseOpenedFrom(5);
                setStep("pause");
              }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Step1Intro({
  onContinue,
  onKeep,
  onPause,
}: {
  onContinue: () => void;
  onKeep: () => void;
  onPause: () => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold tracking-tight text-slate-900">
        We&apos;re sorry to see you go
      </h3>
      <p className="text-sm text-slate-600">
        Before you cancel, we&apos;d love to understand what&apos;s not working and see if
        there&apos;s anything we can do to help. This will take about a minute.
      </p>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm text-slate-700">
          <strong>Just need a break?</strong> Pause your subscription for 1-3 months instead -
          no charge while paused, and it picks back up automatically when you&apos;re ready.
        </p>
        <button
          type="button"
          onClick={onPause}
          className="mt-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Pause my subscription instead
        </button>
      </div>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c]"
        >
          Keep my subscription
        </button>
      </div>
    </div>
  );
}

type StepPauseProps = {
  months: PauseMonths;
  onMonthsChange: (months: PauseMonths) => void;
  actionLoading: boolean;
  actionError: string | null;
  onBack: () => void;
  onConfirm: () => void;
};

function StepPause({
  months,
  onMonthsChange,
  actionLoading,
  actionError,
  onBack,
  onConfirm,
}: StepPauseProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold tracking-tight text-slate-900">
        How long do you need?
      </h3>
      <p className="text-sm text-slate-600">
        While paused, you won&apos;t be charged and Pro access is on hold. Billing and access
        resume automatically on the date you pick - no action needed, and you can also resume
        early anytime from this page.
      </p>
      <fieldset className="space-y-2">
        {([1, 2, 3] as PauseMonths[]).map((m) => (
          <label
            key={m}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition ${
              months === m
                ? "border-[#f97316] bg-[#f97316]/5"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name="pause-months"
              value={m}
              checked={months === m}
              onChange={() => onMonthsChange(m)}
              className="h-4 w-4 accent-[#f97316]"
            />
            <span className="text-slate-700">
              {m} month{m > 1 ? "s" : ""}
            </span>
          </label>
        ))}
      </fieldset>

      {actionError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={actionLoading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={actionLoading}
          className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white hover:bg-[#ea580c] disabled:opacity-60"
        >
          {actionLoading ? "Pausing…" : `Pause for ${months} month${months > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

type Step2Props = {
  reason: Reason | null;
  feedback: string;
  intendedOutcome: string;
  wouldReturn: WouldReturn | null;
  onReason: (r: Reason) => void;
  onFeedback: (f: string) => void;
  onIntendedOutcome: (v: string) => void;
  onWouldReturn: (v: WouldReturn) => void;
  onBack: () => void;
  onContinue: () => void;
};

function Step2Reason({
  reason,
  feedback,
  intendedOutcome,
  wouldReturn,
  onReason,
  onFeedback,
  onIntendedOutcome,
  onWouldReturn,
  onBack,
  onContinue,
}: Step2Props) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold tracking-tight text-slate-900">
        What&apos;s the main reason you&apos;re cancelling?
      </h3>
      <fieldset className="space-y-2">
        {REASONS.map((r) => (
          <label
            key={r.value}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition ${
              reason === r.value
                ? "border-[#f97316] bg-[#f97316]/5"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name="cancel-reason"
              value={r.value}
              checked={reason === r.value}
              onChange={() => onReason(r.value)}
              className="h-4 w-4 accent-[#f97316]"
            />
            <span className="text-slate-700">{r.label}</span>
          </label>
        ))}
      </fieldset>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          What were you hoping to accomplish with Influencer Butler? (optional)
        </label>
        <textarea
          value={intendedOutcome}
          onChange={(e) => onIntendedOutcome(e.target.value)}
          rows={2}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none focus:ring-1 focus:ring-[#f97316]"
          placeholder="e.g. land brand deals, automate outreach, harvest commissions..."
        />
      </div>
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          How likely are you to come back? (optional)
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {WOULD_RETURN_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                wouldReturn === o.value
                  ? "border-[#f97316] bg-[#f97316]/5"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="would-return"
                value={o.value}
                checked={wouldReturn === o.value}
                onChange={() => onWouldReturn(o.value)}
                className="h-4 w-4 accent-[#f97316]"
              />
              <span className="text-slate-700">{o.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Anything else you&apos;d like us to know? (optional)
        </label>
        <textarea
          value={feedback}
          onChange={(e) => onFeedback(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none focus:ring-1 focus:ring-[#f97316]"
          placeholder="Share a quick note - this helps us improve."
        />
      </div>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!reason}
          className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

type Step3Props = {
  reason: Reason | null;
  onBack: () => void;
  onContinue: () => void;
  onKeep: () => void;
};

function Step3Address({ reason, onBack, onContinue, onKeep }: Step3Props) {
  const content = reasonResponse(reason);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold tracking-tight text-slate-900">
        {content.title}
      </h3>
      <div className="space-y-3 text-sm text-slate-600">{content.body}</div>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back
        </button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onKeep}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Keep my subscription
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function reasonResponse(reason: Reason | null): { title: string; body: React.ReactNode } {
  switch (reason) {
    case "too_expensive":
      return {
        title: "We hear you on price",
        body: (
          <>
            <p>
              Pricing matters. On the next screen, we have a special offer for you that
              might make things work better for your budget.
            </p>
          </>
        ),
      };
    case "not_using":
      return {
        title: "Let's get more value out of it",
        body: (
          <>
            <p>
              Influencer Butler works best when you set up a few automations and let them
              run. If you&apos;ve only tried a couple of tools, there are 20+ more waiting.
            </p>
            <p>
              Check out the{" "}
              <a
                href="/dashboard"
                className="font-medium text-[#f97316] hover:text-[#ea580c]"
              >
                dashboard getting-started guide
              </a>{" "}
              for a quick walkthrough of the most impactful tools.
            </p>
          </>
        ),
      };
    case "missing_features":
      return {
        title: "Tell us what's missing",
        body: (
          <p>
            We ship new tools regularly, and the roadmap is partly driven by what paying
            customers request. On the next screen you can tell us exactly what you need -
            and we have an offer that might be worth sticking around for while we build it.
          </p>
        ),
      };
    case "found_alternative":
      return {
        title: "What are they offering that we aren't?",
        body: (
          <>
            <p>
              We&apos;d genuinely love to know what the alternative does better - price,
              features, support, or something else. If you included it in the previous
              step, thank you. If not, feel free to email us at{" "}
              <a
                href="mailto:support@influencerbutler.com"
                className="font-medium text-[#f97316] hover:text-[#ea580c]"
              >
                support@influencerbutler.com
              </a>
              .
            </p>
          </>
        ),
      };
    case "technical_issues":
      return {
        title: "Let us fix it for you",
        body: (
          <p>
            If something&apos;s broken, we want to know - most issues can be resolved
            within a day or two. On the next screen you can tell us what&apos;s wrong,
            and we have an offer that might be worth sticking around for while we fix it.
          </p>
        ),
      };
    case "just_testing":
      return {
        title: "Thanks for trying Influencer Butler",
        body: (
          <p>
            We appreciate you giving it a shot. Before you go, we have a one-time offer
            that might make it worth keeping around a little longer.
          </p>
        ),
      };
    default:
      return {
        title: "One more thing before you go",
        body: (
          <p>
            We have a one-time offer for you on the next screen that might change your
            mind.
          </p>
        ),
      };
  }
}

type Step4Props = {
  loading: boolean;
  error: string | null;
  price: VariantPriceResponse | null;
  actionLoading: boolean;
  actionError: string | null;
  onBack: () => void;
  onAccept: () => void;
  onDecline: () => void;
};

function Step4Offer({
  loading,
  error,
  price,
  actionLoading,
  actionError,
  onBack,
  onAccept,
  onDecline,
}: Step4Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-24 w-full animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  if (error || !price) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "Could not load offer"}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Continue to cancel
          </button>
        </div>
      </div>
    );
  }

  // If the variant interval doesn't map to a known offer, skip the offer UI.
  if (!price.offerType) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          We don&apos;t have a special offer for this plan type right now.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Continue to cancel
          </button>
        </div>
      </div>
    );
  }

  const headline =
    price.offerType === "monthly_50_off_3mo"
      ? `Get ${price.offerPercent}% off for the next 3 months`
      : `Get ${price.offerPercent}% off your next year`;

  return (
    <div className="space-y-5">
      <div>
        <span className="inline-flex items-center rounded-full bg-[#f97316]/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[#ea580c]">
          Exclusive offer
        </span>
        <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
          {headline}
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Stick around and we&apos;ll apply this discount to your next billing cycle
          {price.offerType === "monthly_50_off_3mo" ? "s" : ""}.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-600">Current price</span>
          <span className="text-sm font-medium text-slate-500 line-through">
            {price.currentFormatted}
          </span>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-sm font-semibold text-slate-900">
            With this offer
          </span>
          <span className="text-lg font-bold text-[#f97316]">
            {price.discountedFormatted}
          </span>
        </div>
        {price.totalSavingsFormatted ? (
          <div className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-600">
            You save <span className="font-semibold text-slate-900">{price.totalSavingsFormatted}</span>
          </div>
        ) : null}
      </div>

      {actionError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={actionLoading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Back
        </button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onDecline}
            disabled={actionLoading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            No thanks, cancel
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={actionLoading}
            className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white hover:bg-[#ea580c] disabled:opacity-60"
          >
            {actionLoading
              ? "Applying…"
              : `Claim ${price.offerPercent}% off`}
          </button>
        </div>
      </div>
    </div>
  );
}

type Step4FeatureOfferProps = {
  reason: Reason | null;
  value: string;
  onChange: (v: string) => void;
  actionLoading: boolean;
  actionError: string | null;
  onBack: () => void;
  onAccept: () => void;
  onDecline: () => void;
};

function Step4FeatureOffer({
  reason,
  value,
  onChange,
  actionLoading,
  actionError,
  onBack,
  onAccept,
  onDecline,
}: Step4FeatureOfferProps) {
  const isTechnical = reason === "technical_issues";

  return (
    <div className="space-y-5">
      <div>
        <span className="inline-flex items-center rounded-full bg-[#f97316]/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[#ea580c]">
          Exclusive offer
        </span>
        <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
          {isTechnical ? "Tell us what's broken" : "Tell us what's missing"}
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          {isTechnical
            ? "A few specifics help us track it down fast - what were you trying to do, and what happened instead?"
            : "What feature or workflow do you need that we don't have today? We read every one of these."}
        </p>
      </div>

      <div>
        <label
          htmlFor="feature-offer-ask"
          className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          {isTechnical ? "What's broken? (optional)" : "What are you missing? (optional)"}
        </label>
        <textarea
          id="feature-offer-ask"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none focus:ring-1 focus:ring-[#f97316]"
          placeholder={
            isTechnical
              ? "e.g. the Chrome extension stopped syncing after the last update..."
              : "e.g. scheduling posts to Threads, bulk commission exports..."
          }
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-slate-900">2 months of Pro, free</span>
          <span className="text-lg font-bold text-[#f97316]">$0.00</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Stay subscribed and we&apos;ll zero out your next 2 billing cycles -
          {isTechnical
            ? " giving us time to get this fixed for you."
            : " giving us time to build what you need."}
        </p>
      </div>

      {actionError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={actionLoading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Back
        </button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onDecline}
            disabled={actionLoading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            No thanks, cancel
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={actionLoading}
            className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white hover:bg-[#ea580c] disabled:opacity-60"
          >
            {actionLoading ? "Applying…" : "Claim 2 months free"}
          </button>
        </div>
      </div>
    </div>
  );
}

type Step5Props = {
  renewsAt: string | null;
  actionLoading: boolean;
  actionError: string | null;
  onBack: () => void;
  onKeep: () => void;
  onConfirm: () => void;
  onPause: () => void;
};

function Step5FinalConfirm({
  renewsAt,
  actionLoading,
  actionError,
  onBack,
  onKeep,
  onConfirm,
  onPause,
}: Step5Props) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold tracking-tight text-slate-900">
        Last chance - are you sure?
      </h3>
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p>
          Your subscription will remain active until{" "}
          <strong>{formatDate(renewsAt)}</strong>, after which you&apos;ll lose access to
          all 50+ automation tools, brand outreach, and commission harvesting.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm text-slate-700">
          Not ready to lose everything? <strong>Pause instead</strong> - no charge for 1-3
          months, then it picks back up automatically.
        </p>
        <button
          type="button"
          onClick={onPause}
          disabled={actionLoading}
          className="mt-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Pause my subscription instead
        </button>
      </div>

      {actionError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={actionLoading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Back
        </button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onKeep}
            disabled={actionLoading}
            className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c] disabled:opacity-50"
          >
            Keep my subscription
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={actionLoading}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {actionLoading ? "Cancelling…" : "Yes, cancel subscription"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TerminalCancelled({
  renewsAt,
  onDone,
}: {
  renewsAt: string | null;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Your subscription has been cancelled. You&apos;ll keep access until{" "}
        <strong>{formatDate(renewsAt)}</strong>.
      </p>
      <p className="text-sm text-slate-600">
        We&apos;re sorry to see you go. If you change your mind, you can resubscribe
        anytime from this page.
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function TerminalPaused({
  resumesAt,
  onDone,
}: {
  resumesAt: string | null;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Your subscription is paused. You won&apos;t be charged, and billing and Pro access
        resume automatically on <strong>{formatDate(resumesAt)}</strong>.
      </p>
      <p className="text-sm text-slate-600">
        Changed your mind? You can resume early anytime from this page.
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c]"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function TerminalOfferAccepted({
  result,
  onDone,
}: {
  result: OfferResponse | null;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        We&apos;re thrilled you&apos;re staying. Your discount has been recorded and will
        apply to your upcoming billing cycle{result && result.durationInMonths > 1 ? "s" : ""}.
      </p>
      {result ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Next charge</span>
            <span className="font-semibold text-slate-900">
              {result.nextChargeFormatted}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-slate-600">Discount</span>
            <span className="font-semibold text-[#f97316]">
              {result.offerPercent}% off for {result.durationInMonths}{" "}
              {result.durationInMonths === 1 ? "cycle" : "cycles"}
            </span>
          </div>
          {!result.applied && result.customerPortalUrl ? (
            <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
              One extra step: apply code{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-900">
                {result.discountCode}
              </code>{" "}
              in{" "}
              <a
                href={result.customerPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#f97316] hover:text-[#ea580c]"
              >
                your customer portal
              </a>
              .
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c]"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function TerminalFeatureOfferAccepted({
  result,
  onDone,
}: {
  result: FeatureOfferResponse | null;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        We&apos;re thrilled you&apos;re staying - and we&apos;ll be following up on what you
        told us. Your next {result?.freeMonths ?? 2} billing cycles are on us.
      </p>
      {result ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Next charge</span>
            <span className="font-semibold text-slate-900">{result.nextChargeFormatted}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-slate-600">Offer</span>
            <span className="font-semibold text-[#f97316]">{result.freeMonths} months free</span>
          </div>
          {!result.applied && result.customerPortalUrl ? (
            <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
              One extra step: apply code{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-900">
                {result.discountCode}
              </code>{" "}
              in{" "}
              <a
                href={result.customerPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#f97316] hover:text-[#ea580c]"
              >
                your customer portal
              </a>
              .
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea580c]"
        >
          Done
        </button>
      </div>
    </div>
  );
}
