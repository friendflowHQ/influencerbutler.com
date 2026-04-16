// Free-trial conversion funnel — plain-text emails via Resend. Mirrors
// src/lib/conversion-emails.ts in style (direct fetch, no template library).
// Sent by the /api/cron/affiliate-funnel cron in its sendTrialEmails step.

export type TrialTier = "day0" | "day1" | "day2" | "day3";

type TierCopy = {
  subject: string;
  build: (vars: TrialVars) => string;
};

type TrialVars = {
  firstName: string;
  monthlyCode: string | null;
  annualCode: string | null;
  monthlyPercent: number;
  annualPercent: number;
  subscriptionUrl: string; // link with ?code= prefill
};

const FROM_ADDRESS = "Influencer Butler <hello@influencerbutler.com>";

function monthlyCheckoutUrl(base: string, code: string | null): string {
  if (!code) return base;
  return `${base}?code=${encodeURIComponent(code)}`;
}

function annualCheckoutUrl(base: string, code: string | null): string {
  if (!code) return base;
  return `${base}?code=${encodeURIComponent(code)}&plan=annual`;
}

const COPY: Record<TrialTier, TierCopy> = {
  day0: {
    subject: "Welcome to Influencer Butler — your trial is live",
    build: (v) => {
      const url = monthlyCheckoutUrl(v.subscriptionUrl, v.monthlyCode);
      return [
        `Hi ${v.firstName},`,
        ``,
        `Welcome aboard — your 3-day free trial is active.`,
        ``,
        `Three quick steps to get value today:`,
        `  1. Install the desktop app: https://dl.influencerbutler.com`,
        `  2. Paste your license key (on your welcome page) into the app`,
        `  3. Connect your first creator account and schedule a post`,
        ``,
        v.monthlyCode
          ? `When your trial ends, use code ${v.monthlyCode} for ${v.monthlyPercent}% off your first month. It's unique to you and expires shortly after your trial.`
          : `We'll follow up with a discount code before your trial ends.`,
        ``,
        `Keep going: ${url}`,
        ``,
        `Questions? Just reply to this email.`,
        ``,
        `— The Influencer Butler team`,
      ].join("\n");
    },
  },
  day1: {
    subject: "3 things power users do first with Influencer Butler",
    build: (v) => {
      return [
        `Hi ${v.firstName},`,
        ``,
        `You're one day into your trial — here are the three moves that separate power users from everyone else:`,
        ``,
        `  1. Batch schedule a week of posts in one sitting. Consistency > volume.`,
        `  2. Enable auto-retries for failed uploads so you never lose a queued post.`,
        `  3. Duplicate your best-performing post across all connected accounts.`,
        ``,
        `Full playbook: https://www.influencerbutler.com/docs`,
        ``,
        `Reply with any question — a real human will answer.`,
        ``,
        `— The Influencer Butler team`,
      ].join("\n");
    },
  },
  day2: {
    subject: "Switch to annual and save — 48h before your trial ends",
    build: (v) => {
      const url = annualCheckoutUrl(v.subscriptionUrl, v.annualCode);
      return [
        `Hi ${v.firstName},`,
        ``,
        `Quick heads-up: your trial ends in about 24 hours.`,
        ``,
        v.annualCode
          ? `If you're ready to commit, the annual plan already saves ~25% vs. monthly. Use code ${v.annualCode} for an extra ${v.annualPercent}% off annual — stacking to the biggest discount we offer.`
          : `The annual plan saves ~25% vs. monthly if you're ready to commit.`,
        ``,
        v.annualCode
          ? `This code is unique to you, works only on the annual plan, and expires with your trial.`
          : ``,
        ``,
        `Lock it in: ${url}`,
        ``,
        `Prefer monthly? That's fine too — your ${v.monthlyPercent}% off monthly code is still good.`,
        ``,
        `— The Influencer Butler team`,
      ]
        .filter((line) => line !== undefined)
        .join("\n");
    },
  },
  day3: {
    subject: "Your trial ends today — your discount codes expire at midnight",
    build: (v) => {
      const monthlyUrl = monthlyCheckoutUrl(v.subscriptionUrl, v.monthlyCode);
      const annualUrl = annualCheckoutUrl(v.subscriptionUrl, v.annualCode);
      return [
        `Hi ${v.firstName},`,
        ``,
        `Last call — your trial ends tonight, and so do your personal discount codes.`,
        ``,
        v.monthlyCode
          ? `• ${v.monthlyPercent}% off monthly: ${v.monthlyCode}`
          : ``,
        v.annualCode
          ? `• ${v.annualPercent}% off annual: ${v.annualCode}`
          : ``,
        ``,
        v.annualCode
          ? `Monthly: ${monthlyUrl}\nAnnual (best value): ${annualUrl}`
          : `Continue: ${monthlyUrl}`,
        ``,
        `Both codes are single-use and locked to your account. After tonight, regular pricing applies.`,
        ``,
        `— The Influencer Butler team`,
      ]
        .filter((line) => line !== "")
        .join("\n");
    },
  },
};

export type TrialEmailPayload = {
  tier: TrialTier;
  to: string;
  name: string;
  monthlyCode: string | null;
  annualCode: string | null;
  monthlyPercent: number;
  annualPercent: number;
  subscriptionUrl: string;
};

export async function sendTrialEmail(payload: TrialEmailPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not set — trial email skipped");
    return false;
  }

  const copy = COPY[payload.tier];
  const firstName = payload.name.split(" ")[0] || "there";

  const body = copy.build({
    firstName,
    monthlyCode: payload.monthlyCode,
    annualCode: payload.annualCode,
    monthlyPercent: payload.monthlyPercent,
    annualPercent: payload.annualPercent,
    subscriptionUrl: payload.subscriptionUrl,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [payload.to],
        subject: copy.subject,
        text: body,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Trial email send failed", { status: res.status, body: text.slice(0, 500) });
      return false;
    }
    return true;
  } catch (error) {
    console.error("Trial email send threw", error);
    return false;
  }
}
