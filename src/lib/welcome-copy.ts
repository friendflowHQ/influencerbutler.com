// Per-tier copy for the /welcome/* thank-you pages. Kept as a single module so
// the three tier routes stay thin render-only components.

export type WelcomeTier = "trial" | "monthly" | "annual";

export type WelcomeCopy = {
  eyebrow: string;
  headline: string;
  subhead: string;
  steps: ReadonlyArray<{ title: string; body: string }>;
  /** Optional tier-specific callout shown below the steps. */
  callout?: {
    title: string;
    body: string;
    ctaLabel: string;
    ctaHref: string;
  };
};

export const WELCOME_COPY: Record<WelcomeTier, WelcomeCopy> = {
  trial: {
    eyebrow: "Your 3-day trial is live",
    headline: "Welcome to Influencer Butler",
    subhead:
      "You have full access for the next 3 days. Install the desktop app, activate your license key, and start scheduling.",
    steps: [
      {
        title: "Download and install the desktop app",
        body: "Use the button below to grab the Windows installer.",
      },
      {
        title: "Activate with your license key",
        body: "Paste the key shown on this page into the app when it launches.",
      },
      {
        title: "Connect your first account",
        body: "Sign in with the creator account you want to automate — it only takes a minute.",
      },
      {
        title: "Watch for a 20% discount code",
        body: "We'll email you a unique 20% off code (and a 30% annual-switch offer) so you can keep going after day 3.",
      },
    ],
    callout: {
      title: "Prefer to lock in the best price now?",
      body: "Switching to the annual plan at any time during your trial saves you ~25% vs. paying monthly.",
      ctaLabel: "See annual pricing",
      ctaHref: "/dashboard/subscription",
    },
  },
  monthly: {
    eyebrow: "You're in — Pro Monthly",
    headline: "Thanks for subscribing!",
    subhead:
      "Your Pro Monthly plan is active. Install the app with the license key below and you're set.",
    steps: [
      {
        title: "Download the desktop app",
        body: "Install Influencer Butler on the computer that will run your automations.",
      },
      {
        title: "Activate with your license key",
        body: "Copy the key below and paste it into the app on first launch.",
      },
      {
        title: "Connect your accounts and schedule",
        body: "Link the creator accounts you want to automate and queue up your first batch of posts.",
      },
    ],
    callout: {
      title: "Switch to annual and save ~25%",
      body: "Thinking long-term? Upgrade to the annual plan anytime from your billing page.",
      ctaLabel: "View billing options",
      ctaHref: "/dashboard/subscription",
    },
  },
  annual: {
    eyebrow: "You're in — Pro Annual",
    headline: "Welcome aboard — and nice move on annual.",
    subhead:
      "You saved ~25% vs. monthly. Install the app, activate your key, and you're locked in for the year.",
    steps: [
      {
        title: "Download the desktop app",
        body: "Install Influencer Butler on your computer.",
      },
      {
        title: "Activate with your license key",
        body: "Paste the key shown on this page into the app when it first opens.",
      },
      {
        title: "Invite a teammate or refer a friend",
        body: "Your Pro Annual plan includes affiliate benefits — earn 35% recurring on anyone you refer.",
      },
    ],
    callout: {
      title: "Earn 35% recurring by referring other creators",
      body: "Apply to the affiliate program and share your personal discount code with your network.",
      ctaLabel: "Open affiliate dashboard",
      ctaHref: "/dashboard/affiliates",
    },
  },
};

export const DESKTOP_APP_DOWNLOAD_URL = "https://dl.influencerbutler.com";
