// Per-tier copy for the /welcome/* thank-you pages. Kept as a single module so
// the three tier routes stay thin render-only components.

export type WelcomeTier = "free" | "trial" | "monthly" | "annual";

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
  free: {
    eyebrow: "You're on the Free forever plan",
    headline: "Welcome to Influencer Butler",
    subhead:
      "The whole Chrome extension and five See & Organize butlers are free forever, no card required. Here's how to get the most out of them.",
    steps: [
      {
        title: "Add the Chrome extension",
        body: "Install it and browse Amazon like normal: video counts, content gaps, Butler Approved seals, and storefront checks all work with no login.",
      },
      {
        title: "Install the desktop app for the free butlers",
        body: "Like Butler, Benable Like Butler, CC Check, Orders Butler, and Storefront Butler run free on any account.",
      },
      {
        title: "Import and organize",
        body: "Pull your full Amazon order history with Orders Butler and audit your photo & video coverage with Storefront Butler.",
      },
      {
        title: "Upgrade when you're ready",
        body: "When you want the money engines (outreach automation, DMs, commission harvesting, and the rest of the 40+ butlers), start a 3-day Pro trial.",
      },
    ],
    callout: {
      title: "Ready for the money engines?",
      body: "Start a 3-day Pro trial to unlock all 40+ butlers with full Pro access. Cancel anytime before day 3.",
      ctaLabel: "See Pro pricing",
      ctaHref: "/pricing",
    },
  },
  trial: {
    eyebrow: "Your 3-day Pro trial is live",
    headline: "Welcome to Influencer Butler",
    subhead:
      "You have full access for the next 3 days. Install the desktop app, activate your license key, and start scheduling.",
    steps: [
      {
        title: "Download and install the desktop app",
        body: "Use the button below to grab the installer for your computer.",
      },
      {
        title: "Activate with your license key",
        body: "Paste the key shown on this page into the app when it launches.",
      },
      {
        title: "Connect your first account",
        body: "Sign in with the creator account you want to automate - it only takes a minute.",
      },
      {
        title: "Watch for a 20% discount code",
        body: "We'll email you a unique 20% off code (and a 30% annual-switch offer) so you can keep going after day 3.",
      },
    ],
    callout: {
      title: "Prefer to lock in the best price now?",
      body: "Switching to the annual plan at any time during your trial saves you ~17% vs. paying monthly.",
      ctaLabel: "See annual pricing",
      ctaHref: "/dashboard/subscription",
    },
  },
  monthly: {
    eyebrow: "You're in - Pro Monthly",
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
      title: "Switch to annual and save ~17%",
      body: "Thinking long-term? Upgrade to the annual plan anytime from your billing page.",
      ctaLabel: "View billing options",
      ctaHref: "/dashboard/subscription",
    },
  },
  annual: {
    eyebrow: "You're in - Pro Annual",
    headline: "Welcome aboard - and nice move on annual.",
    subhead:
      "You saved ~17% vs. monthly. Install the app, activate your key, and you're locked in for the year.",
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
        body: "Your Pro Annual plan includes affiliate benefits - earn 30% recurring (for 12 months) on anyone you refer.",
      },
    ],
    callout: {
      title: "Earn 30% recurring (12 months per referral) by referring other creators",
      body: "Apply to the affiliate program and share your personal discount code with your network.",
      ctaLabel: "Open affiliate dashboard",
      ctaHref: "/dashboard/affiliates",
    },
  },
};

// Fallback version for the Mac installer filenames (electron-builder writes
// InfluencerButler-${version}-${arch}.dmg). The /api/trial/start redirect
// resolves the current version live from the release feed's latest-mac.yml,
// so this pin is only used when that feed is unreachable. Still worth bumping
// on each desktop release.
export const DESKTOP_APP_VERSION = "1.0.42";

// Windows installer host. NOTE: this host redirects *everything* to the Windows
// .exe, so never point a Mac button at it.
export const WINDOWS_DOWNLOAD_URL = "https://dl.influencerbutler.com";

// Mac installers live on a different host than Windows (the desktop app's
// release feed). Apple Silicon is arm64, Intel is x64.
export const MAC_RELEASES_BASE =
  "https://influencerbutler.influencerbutler.com/dcb/releases";
export const MAC_ARM_DOWNLOAD_URL = `${MAC_RELEASES_BASE}/InfluencerButler-${DESKTOP_APP_VERSION}-arm64.dmg`;
export const MAC_INTEL_DOWNLOAD_URL = `${MAC_RELEASES_BASE}/InfluencerButler-${DESKTOP_APP_VERSION}-x64.dmg`;

// Back-compat alias: existing imports of DESKTOP_APP_DOWNLOAD_URL get Windows.
export const DESKTOP_APP_DOWNLOAD_URL = WINDOWS_DOWNLOAD_URL;
