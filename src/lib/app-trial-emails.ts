// App-trial nurture drip - plain-text emails via Resend. Mirrors
// src/lib/free-onboarding-emails.ts in style (direct sendMarketingEmail, no
// template library). Sent by the /api/cron/affiliate-funnel cron in its
// sendAppTrialEmails step.
//
// Audience: people who installed the desktop app and typed their email into
// the startup walkthrough (email_subscribers rows with app_trial_started_at
// set, enrolled by /api/app-trial/signup). They are on the local 14-day app
// trial: no card, no Lemon Squeezy subscription, so nothing auto-charges and
// nothing chases them. Before this drip existed they got no email at all, and
// the app simply locked on day 14.
//
// The copy is Liz's, ported from the lifecycle worker that was written but
// never deployed (workers/lifecycle/src/lib/templates.js in the desktop repo,
// rendered previews in marketing/email-templates/preview/, strategy in
// marketing/lifecycle-email-system.md). Sequence A steps E0 to E10 map to the
// tiers below. Keeping it here rather than deploying that worker means one
// contact list, one suppression path, and copy the admin Emails page can edit.
//
// Shape of the arc: days 0 to 10 are activation, told as the founder's own
// story; day12 and day14 are the trial-ending nudges; days 17 to 30 are a
// short, spaced lapsed tail that stops crowding the inbox.

import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { lifecycleFrom } from "@/lib/email-senders";
import { getFunnelOverrides, resolveFunnelCopy } from "@/lib/funnel-copy";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import { createAdminClient } from "@/lib/supabase/admin";

export type AppTrialTier =
  | "day0"
  | "day1"
  | "day3"
  | "day5"
  | "day7"
  | "day10"
  | "day12"
  | "day14"
  | "day17"
  | "day21"
  | "day30";

export type AppTrialVars = {
  firstName: string;
  pricingUrl: string; // /pricing, optionally carrying a ?code= discount
  helpUrl: string;
  discountCode: string | null;
  discountPercent: number;
};

export type TierCopy = {
  subject: string | ((vars: AppTrialVars) => string);
  build: (vars: AppTrialVars) => string;
};

const FROM_ADDRESS = lifecycleFrom();
const COMMUNITY_LINE = `Join our creator community on Facebook: ${FACEBOOK_GROUP_URL}`;

// The six free-forever butlers, kept in sync with entitlements.ts, trial day14,
// and the onboarding drip. These keep running after the app trial ends, which
// is why the later emails can stay warm instead of reading as a shutdown notice.
const FREE_BUTLERS =
  "Like Butler, Benable Like Butler, Instagram Like Butler, CC Check, Orders Butler, and Storefront Butler";

export const APP_TRIAL_COPY: Record<AppTrialTier, TierCopy> = {
  day0: {
    subject: "You're in. Here's the one thing to do first.",
    build: (v) =>
      [
        `Hey ${v.firstName},`,
        ``,
        `Liz here. I actually built Influencer Butler, so this is really me, and I read replies.`,
        ``,
        `Quick background: I've been an Instagram influencer for 11 years, on TikTok for 6, and an Amazon influencer for 4. For most of that I was drowning in busywork. Chasing brand deals, copying commission numbers into spreadsheets, DMing, liking, keeping 200+ accounts alive. I hired a VA. I hired an agent. I still felt behind.`,
        ``,
        `So I built butlers to do the boring parts for me. That's what you just installed.`,
        ``,
        `The fastest way to get it is to run one butler today. Open the app and start with Daily Commission Butler. It pulls your Amazon commissions automatically so you can see your real numbers without touching a spreadsheet. Two minutes, and you'll understand the whole product.`,
        ``,
        `One favor: hit reply and tell me what you're hoping this saves you from. I read every one, and it shapes what I build next.`,
        ``,
        `- Liz`,
      ].join("\n"),
  },
  day1: {
    subject: "Did your commissions show up yet?",
    build: (v) =>
      [
        `Hey ${v.firstName},`,
        ``,
        `Checking in on day one. If you ran Daily Commission Butler yesterday, you should be looking at your Amazon commissions without having logged into anything or built a single spreadsheet formula. That feeling, when the busywork just isn't there anymore, is the whole point.`,
        ``,
        `If you haven't run it yet, open the app and hit start on Daily Commission Butler. It does the boring part. You watch.`,
        ``,
        `If something looked off, reply to this email and tell me what you saw. I'll help you sort it.`,
        ``,
        `Step-by-step tutorials for every butler: ${v.helpUrl}`,
        ``,
        `- Liz`,
      ].join("\n"),
  },
  day3: {
    subject: "I fired my agent. Here's what happened.",
    build: (v) =>
      [
        `${v.firstName},`,
        ``,
        `For a while I had an agent and a VA. On paper that's the dream. In reality I was paying a lot of money every month to still be the bottleneck, because nobody knew my accounts or my voice like I did, and explaining it took longer than doing it.`,
        ``,
        `So I started automating the pieces myself. Outreach to brands. Commission tracking. The endless engagement work across all my accounts. One by one, the things I was paying humans to do became butlers that ran on their own.`,
        ``,
        `Eventually I let the agent and the VA go. That was the scary part. But my income didn't drop. My hours did. I got my evenings back, and I stopped feeling like I was managing a small company just to run my own influencer business.`,
        ``,
        `That's the entire reason Influencer Butler exists. It's not a startup idea someone dreamed up. It's the actual system I run my career on, packaged so you can run yours on it too.`,
        ``,
        `You've got a few days left on your trial. If there's one task you'd love to never do again, reply and tell me. There's a decent chance a butler already handles it.`,
        ``,
        `- Liz`,
      ].join("\n"),
  },
  day5: {
    subject: "The butler that pitches brands while you sleep",
    build: (v) =>
      [
        `Hey ${v.firstName},`,
        ``,
        `Landing brand deals used to be my least favorite job. Find the brand, find the contact, write the pitch, follow up, track who replied, do it again a hundred times. It's the kind of work an agent takes a cut for and still does slowly.`,
        ``,
        `Amazon Butler does it for you. It works your Amazon Creator Connections outreach automatically: reaching out to brands, sending your pitch, and keeping track of it all so you're not living in a spreadsheet of did I follow up with them yet.`,
        ``,
        `If you've ever felt like you're leaving brand money on the table just because outreach is exhausting, this is the one to try today. Open the app, go to Amazon Butler, and let it run.`,
        ``,
        `Bonus: it has an AI keyword generator built in, so your outreach and campaigns target the right products instead of guessing. More on that one later.`,
        ``,
        `- Liz`,
      ].join("\n"),
  },
  day7: {
    subject: "How I run 200+ Instagram accounts (without losing my mind)",
    build: (v) =>
      [
        `${v.firstName},`,
        ``,
        `People don't believe me when I say I run over 200 Instagram accounts on autopilot. Then they remember I founded The Comment Pod and it clicks: I've spent years obsessed with one problem, which is how to do the engagement work at scale without it eating your life.`,
        ``,
        `Here's the trap nobody warns you about. Posting is the easy part. The grind is everything around it: liking, commenting, DMing, nudging your close friends list, replying to the same questions over and over. Do that across even five accounts and you're working all day. Across 200 it's impossible by hand.`,
        ``,
        `So I built butlers for it:`,
        ``,
        `  1. Like Butler handles the liking work that keeps accounts active and visible.`,
        `  2. Messenger Butler handles the DMs so conversations don't pile up unanswered.`,
        `  3. Close Friends Butler keeps your close friends audience warm, which is where a lot of quiet sales actually happen.`,
        ``,
        `You don't have to run 200 accounts to feel this. Even on one account, handing the repetitive engagement to a butler is the difference between I'll get to it and it's already done.`,
        ``,
        `Halfway through your trial. Pick one of these and let it run today.`,
        ``,
        COMMUNITY_LINE,
        ``,
        `- Liz`,
      ].join("\n"),
  },
  day10: {
    subject: "Want to see your hours-saved number?",
    build: (v) =>
      [
        `Hey ${v.firstName},`,
        ``,
        `By now you've probably run a few butlers. Here's something most people miss: the app is tracking what it's saving you.`,
        ``,
        `Look at the top of the dashboard. There's Hours Saved and Money Saved, and there's a spot to put in your hourly rate so the money number reflects what your time is actually worth. Earnings Intelligence goes deeper, turning your commission and order data into a picture of what's actually working.`,
        ``,
        `I added these because I needed proof, for myself, that automating wasn't just a fun project but real time and money back in my pocket. When I saw the hours add up, I stopped second-guessing whether to let my VA go.`,
        ``,
        `Go look at your number. Then ask yourself what you'd do with that time every week. Reply and tell me, I'm curious what you'd reclaim.`,
        ``,
        `- Liz`,
      ].join("\n"),
  },
  day12: {
    subject: (v) => `Your trial wraps in 2 days, ${v.firstName}`,
    build: (v) =>
      [
        `${v.firstName},`,
        ``,
        `Your trial ends in two days, so I wanted to give you a heads up rather than let it surprise you.`,
        ``,
        `If the butlers have earned a spot in your routine, staying on is simple and everything you've set up stays exactly as it is. If you're not sure yet, that's fair too. Tell me what's holding you back, honestly, and I'll give you a straight answer about whether this is right for you. I would rather you not pay than pay for something that isn't a fit.`,
        ``,
        `Either way, I'm glad you tried it.`,
        ``,
        `- Liz`,
      ].join("\n"),
  },
  day14: {
    subject: (v) => `Today's the day, ${v.firstName}`,
    build: (v) => {
      const lines = [
        `Hey ${v.firstName},`,
        ``,
        `Your trial ends today. Here's the simple version.`,
        ``,
        `If you keep going, the butlers keep doing the work: the commission tracking, the brand outreach, the engagement, all of it running quietly in the background while you do the parts only you can do. That's the trade I make every single day, and it's the best money I spend on my business.`,
        ``,
      ];
      if (v.discountCode) {
        lines.push(
          `If today is the day, use code ${v.discountCode} for ${v.discountPercent}% off your first month.`,
          ``,
        );
      }
      lines.push(
        `Keep your butlers running: ${v.pricingUrl}`,
        ``,
        `If you'd rather not, no hard feelings. Your free-forever butlers (${FREE_BUTLERS}) and the whole Chrome extension keep working. No card, no expiry.`,
        ``,
        `And if something's stopping you that I could actually fix, reply and tell me. I read everything.`,
        ``,
        `- Liz`,
      );
      return lines.join("\n");
    },
  },
  day17: {
    subject: "Did something get in the way?",
    build: (v) =>
      [
        `${v.firstName},`,
        ``,
        `Your trial ended a few days ago and you didn't continue, which is completely fine. But I've learned that when someone tries the butlers and doesn't stay, it's usually one of three things:`,
        ``,
        `  1. They didn't get a butler fully running and never hit the oh, that's amazing moment.`,
        `  2. The timing was off and life got busy.`,
        `  3. It's just not for them right now.`,
        ``,
        `If it's the first one, reply and tell me which butler you were trying. I'll personally help you get it working, no charge, even though your trial is over. I'd rather you make a real decision than a busy one.`,
        ``,
        `- Liz`,
      ].join("\n"),
  },
  day21: {
    subject: "What I used to pay a human to do this",
    build: (v) =>
      [
        `Hey ${v.firstName},`,
        ``,
        `Let me put real numbers on this, because it's what finally moved me.`,
        ``,
        `A VA who could half-handle my engagement and outreach ran me well into four figures a month, and I still had to manage them. An agent took a percentage of deals on top of that. And neither one worked at 2am, or on weekends, or across every account at once.`,
        ``,
        `The butlers cost a tiny fraction of that and never clock out. That's not a knock on great VAs, I've worked with wonderful people. It's just that the repetitive work was never the part that needed a human. It needed a system.`,
        ``,
        `If you do that math for your own business and it makes sense, your setup is right where you left it.`,
        ``,
        `Pick up where you left off: ${v.pricingUrl}`,
        ``,
        `- Liz`,
      ].join("\n"),
  },
  day30: {
    subject: "I'll stop crowding your inbox",
    build: (v) =>
      [
        `${v.firstName},`,
        ``,
        `I'm going to ease off, because the last thing I want is to be the founder cluttering your inbox.`,
        ``,
        `Before I do: the reason I keep building isn't to chase signups. It's that I lived the version of this work where you do everything by hand or pay people a fortune to half-do it, and I don't want anyone stuck there. The butlers are how I got out.`,
        ``,
        `If and when the timing's right, everything you set up is still saved and waiting. I'll check in now and then with useful stuff, not a sales pitch.`,
        ``,
        `Reactivate whenever you're ready: ${v.pricingUrl}`,
        ``,
        `- Liz`,
      ].join("\n"),
  },
};

export type AppTrialEmailPayload = {
  tier: AppTrialTier;
  to: string;
  name: string;
  pricingUrl: string;
  helpUrl: string;
  discountCode: string | null;
  discountPercent: number;
};

export async function sendAppTrialEmail(payload: AppTrialEmailPayload): Promise<boolean> {
  const copy = APP_TRIAL_COPY[payload.tier];
  const firstName = payload.name.split(" ")[0] || "there";

  const vars: AppTrialVars = {
    firstName,
    pricingUrl: payload.pricingUrl,
    helpUrl: payload.helpUrl,
    discountCode: payload.discountCode,
    discountPercent: payload.discountPercent,
  };
  const subject = typeof copy.subject === "function" ? copy.subject(vars) : copy.subject;
  const body = copy.build(vars);

  const overrides = await getFunnelOverrides();
  const resolved = resolveFunnelCopy({
    funnel: "apptrial",
    tier: payload.tier,
    vars: vars as unknown as Record<string, unknown>,
    defaults: { subject, body },
    overrides,
  });
  const ok = await sendMarketingEmail({
    from: FROM_ADDRESS,
    to: payload.to,
    subject: resolved.subject,
    text: resolved.body,
    category: `apptrial_${payload.tier}`,
    funnel: "apptrial",
    trackOpens: true,
  });
  if (ok && resolved.applyTag) {
    try {
      await tagRecipientsAsContacts(
        createAdminClient(),
        [payload.to],
        resolved.applyTag,
        "funnel:apptrial",
      );
    } catch (err) {
      console.error("app-trial-emails: tag-on-send failed", err);
    }
  }
  return ok;
}
