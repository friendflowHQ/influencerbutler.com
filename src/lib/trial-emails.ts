// Free-trial conversion funnel - plain-text emails via Resend. Mirrors
// src/lib/conversion-emails.ts in style (direct fetch, no template library).
// Sent by the /api/cron/affiliate-funnel cron in its sendTrialEmails step.

import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { annualSavingsPct } from "@/lib/pricing-constants";

export type TrialTier = "day0" | "day1" | "day2" | "day3";

type TierCopy = {
  // Subject can depend on the vars (day3 drops the codes mention when the
  // user has no codes).
  subject: string | ((vars: TrialVars) => string);
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
const COMMUNITY_LINE = `Join our creator community on Facebook: ${FACEBOOK_GROUP_URL}`;

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
    subject: "Welcome to Influencer Butler: your trial is live",
    build: (v) => {
      const url = monthlyCheckoutUrl(v.subscriptionUrl, v.monthlyCode);
      return [
        `Hi ${v.firstName},`,
        ``,
        `Welcome aboard - your 3-day free trial is active.`,
        ``,
        `Three quick steps to get value today:`,
        `  1. Install the desktop app: https://www.influencerbutler.com/download`,
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
        COMMUNITY_LINE,
        ``,
        `- The Influencer Butler team`,
      ].join("\n");
    },
  },
  day1: {
    subject: "3 things power users do first with Influencer Butler",
    build: (v) => {
      return [
        `Hi ${v.firstName},`,
        ``,
        `You're one day into your trial - here are the three moves that separate power users from everyone else:`,
        ``,
        `  1. Batch schedule a week of posts in one sitting. Consistency > volume.`,
        `  2. Enable auto-retries for failed uploads so you never lose a queued post.`,
        `  3. Duplicate your best-performing post across all connected accounts.`,
        ``,
        `Full playbook: https://www.influencerbutler.com/docs`,
        ``,
        `Reply with any question - a real human will answer.`,
        ``,
        COMMUNITY_LINE,
        ``,
        `- The Influencer Butler team`,
      ].join("\n");
    },
  },
  day2: {
    subject: "24 hours left: switch to annual and save",
    build: (v) => {
      const url = annualCheckoutUrl(v.subscriptionUrl, v.annualCode);
      const annualBase = annualSavingsPct("solo");
      const lines = [
        `Hi ${v.firstName},`,
        ``,
        `Quick heads-up: your trial ends in about 24 hours.`,
        ``,
      ];
      if (v.annualCode) {
        lines.push(
          `If you're ready to commit, annual already costs ${annualBase}% less than paying monthly. Use code ${v.annualCode} for an extra ${v.annualPercent}% off annual on top: the biggest discount we offer.`,
          ``,
          `This code is unique to you, works only on the annual plan, and expires with your trial.`,
        );
      } else {
        lines.push(
          `Annual already costs ${annualBase}% less than paying monthly if you're ready to commit.`,
        );
      }
      lines.push(``, `Lock it in: ${url}`, ``);
      if (v.monthlyCode) {
        lines.push(`Not ready for annual? Your ${v.monthlyPercent}% off monthly code still works.`, ``);
      }
      lines.push(COMMUNITY_LINE, ``, `- The Influencer Butler team`);
      return lines.join("\n");
    },
  },
  day3: {
    subject: (v) =>
      v.monthlyCode || v.annualCode
        ? "Your trial ends today: your discount codes expire at midnight"
        : "Your trial ends today",
    build: (v) => {
      const monthlyUrl = monthlyCheckoutUrl(v.subscriptionUrl, v.monthlyCode);
      const annualUrl = annualCheckoutUrl(v.subscriptionUrl, v.annualCode);
      const hasBoth = Boolean(v.monthlyCode && v.annualCode);
      const hasAny = Boolean(v.monthlyCode || v.annualCode);

      const lines = [`Hi ${v.firstName},`, ``];
      if (hasAny) {
        lines.push(`Last call - your trial ends tonight, and so do your personal discount codes.`, ``);
        if (v.monthlyCode) {
          lines.push(`• ${v.monthlyPercent}% off monthly: ${v.monthlyCode}`);
        }
        if (v.annualCode) {
          lines.push(`• ${v.annualPercent}% off annual: ${v.annualCode}`);
        }
        lines.push(``);
      } else {
        lines.push(`Last call - your trial ends tonight.`, ``);
      }
      if (v.annualCode) {
        lines.push(`Monthly: ${monthlyUrl}`, `Annual (best value): ${annualUrl}`);
      } else {
        lines.push(`Continue: ${monthlyUrl}`);
      }
      lines.push(``);
      if (hasBoth) {
        lines.push(`Both codes are single-use and locked to your account. After tonight, regular pricing applies.`);
      } else if (hasAny) {
        lines.push(`Your code is single-use and locked to your account. After tonight, regular pricing applies.`);
      } else {
        lines.push(`After tonight, regular pricing applies.`);
      }
      lines.push(``, COMMUNITY_LINE, ``, `- The Influencer Butler team`);
      return lines.join("\n");
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
    console.error("RESEND_API_KEY not set - trial email skipped");
    return false;
  }

  const copy = COPY[payload.tier];
  const firstName = payload.name.split(" ")[0] || "there";

  const vars: TrialVars = {
    firstName,
    monthlyCode: payload.monthlyCode,
    annualCode: payload.annualCode,
    monthlyPercent: payload.monthlyPercent,
    annualPercent: payload.annualPercent,
    subscriptionUrl: payload.subscriptionUrl,
  };
  const subject = typeof copy.subject === "function" ? copy.subject(vars) : copy.subject;
  const body = copy.build(vars);

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
        subject,
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
