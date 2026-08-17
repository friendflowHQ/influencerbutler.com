/**
 * Summary: The approved image pool for autopilot posts. The writer may only
 *   embed images from this index (lint drops anything else), so every path
 *   here must exist in public/. The static list is hand-curated from the real
 *   screenshots shipped with the site; dynamicScreenshots() additionally folds
 *   in anything the phase-2 capture pipeline commits to public/assets/app/
 *   (with captions from _captions.json), so fresh captures join the pool with
 *   no code change.
 * Dependencies: lib/github-content (reads via the GitHub API, NOT local fs -
 *   local fs reads of public/ would trace the whole folder into the bundle).
 */
import { getTextFile, listDir } from "@/lib/github-content";

export type ScreenshotEntry = { path: string; description: string };

export const STATIC_SCREENSHOTS: ScreenshotEntry[] = [
  // Desktop app: real feature screenshots
  { path: "/assets/features/orders-butler-hero.png", description: "Orders Butler workspace in the desktop app showing synced Amazon order history with ASINs" },
  { path: "/assets/features/pitch-butler-hero.png", description: "Pitch Butler CRM board in the desktop app with brand pipelines and outreach stages" },
  { path: "/assets/features/instagram-butler-hero.png", description: "Instagram Butler workspace configured to send outreach DMs with templates and filters" },
  { path: "/assets/features/messenger-butler-hero.png", description: "Messenger Butler workspace sending personalized Instagram opening DMs" },
  { path: "/assets/features/ads-goldmine-hero.png", description: "Ads Goldmine workspace scoring ASINs across ad and sponsorship signal tiers" },
  { path: "/assets/features/focus-mode-hero.png", description: "Focus Mode: the calmer, distraction-free desktop workspace view" },
  { path: "/assets/features/video-reload-butler-hero.png", description: "Video Reload Butler re-uploading Amazon storefront videos across marketplaces" },
  { path: "/assets/features/daily-deals-butler-carousel-1.png", description: "Deals Influencer Butler deal feed filtered by price, discount, and commission" },
  { path: "/assets/features/daily-deals-butler-carousel-2.png", description: "Deals Influencer Butler post template editor for automated deal posts" },
  { path: "/assets/features/daily-deals-butler-carousel-3.png", description: "Deals Influencer Butler social destinations picker (Facebook groups, pages, Telegram)" },
  { path: "/assets/features/daily-deals-butler-carousel-4.png", description: "Deals Influencer Butler posting schedule configuration" },
  { path: "/assets/features/daily-deals-butler-carousel-5.png", description: "Deals Influencer Butler run history of automatically posted deals" },
  { path: "/assets/features/cc-check-carousel-1.png", description: "CC Check results table checking ASINs against live Creator Connections catalogs" },
  { path: "/assets/features/cc-check-carousel-2.png", description: "CC Check accepting Creator Connections campaigns from the results table" },
  { path: "/assets/features/cc-check-carousel-3.png", description: "CC Check brand extraction view from checked ASINs" },
  { path: "/assets/features/photo-reload-butler-1.png", description: "Photo Reload Butler selecting storefront photos to re-post to other marketplaces" },
  { path: "/assets/features/photo-reload-butler-2.png", description: "Photo Reload Butler marketplace targets (Canada, UK, Australia, Singapore)" },
  { path: "/assets/features/photo-reload-butler-3.png", description: "Photo Reload Butler run results after reloading photos" },
  { path: "/assets/features/voiceover-butler-1.png", description: "Voiceover Butler generating an FTC-compliant script from an ASIN" },
  { path: "/assets/features/voiceover-butler-2.png", description: "Voiceover Butler script validation against Amazon video rules" },
  { path: "/assets/features/voiceover-butler-3.png", description: "Voiceover Butler finished voiceover script ready to record" },
  // Desktop app: onboarding
  { path: "/assets/setup/main_dashboard_tour.png", description: "The desktop app main dashboard with the butler workspaces sidebar" },
  { path: "/assets/setup/onboarding_walkthrough_auto_setup_view.png", description: "The desktop app onboarding walkthrough auto-setup step" },
  // Chrome extension
  { path: "/assets/extension/extension_shot_1_product_page_1280x800.png", description: "Chrome extension on an Amazon product page showing influencer vs brand video counts" },
  { path: "/assets/extension/extension_shot_2_campaign_radar_1280x800.png", description: "Chrome extension Campaign Radar over the Creator Connections campaign grid with fill meters" },
  { path: "/assets/extension/extension_shot_3_storefront_checkup_1280x800.png", description: "Chrome extension storefront checkup grading an Amazon storefront" },
  { path: "/assets/extension/extension_shot_4_popup_1280x800.png", description: "Chrome extension popup with quick stats and controls" },
  { path: "/assets/extension/extension_shot_5_search_overlay_1280x800.png", description: "Chrome extension money-first search overlay ranking Amazon results by earning potential" },
  // Cloud PC guide steps (useful for automation/always-on posts)
  { path: "/assets/blog/cloud-pc/12-cloud-desktop.png", description: "A Windows cloud PC desktop reached over Remote Desktop, ready to run Influencer Butler" },
  { path: "/assets/blog/cloud-pc/14-running.png", description: "Influencer Butler running on an always-on cloud PC" },
  // Course visuals (illustrations for beginner Amazon Influencer topics)
  { path: "/assets/course/aip-course-02-what-is-the-amazon-influencer-program.png", description: "Illustration: what the Amazon Influencer Program is and how creators get paid" },
  { path: "/assets/course/aip-course-05-filming-review-videos.png", description: "Illustration: filming simple Amazon review videos with a phone" },
  { path: "/assets/course/aip-course-07-build-your-storefront.png", description: "Illustration: building an Amazon storefront people browse" },
  { path: "/assets/course/aip-course-10-scaling-and-automation.png", description: "Illustration: scaling an Amazon Influencer business with automation" },
];

const CAPTIONS_PATH = "public/assets/app/_captions.json";
const APP_DIR = "public/assets/app";

/**
 * Static pool + any phase-2 captured shots under public/assets/app/.
 * Capture failures or an absent directory degrade to the static pool.
 */
export async function loadScreenshotIndex(): Promise<ScreenshotEntry[]> {
  const entries = [...STATIC_SCREENSHOTS];
  try {
    const [files, captionsFile] = await Promise.all([
      listDir(APP_DIR),
      getTextFile(CAPTIONS_PATH),
    ]);
    let captions: Record<string, string> = {};
    if (captionsFile) {
      try {
        captions = JSON.parse(captionsFile.text) as Record<string, string>;
      } catch {
        // Bad captions file: fall back to filename-derived descriptions.
      }
    }
    for (const file of files) {
      if (file.type !== "file" || !/\.(png|jpg|jpeg|webp|gif)$/i.test(file.name)) continue;
      entries.push({
        path: `/assets/app/${file.name}`,
        description:
          captions[file.name] ||
          `Influencer Butler screenshot: ${file.name.replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ")}`,
      });
    }
  } catch {
    // public/assets/app does not exist yet (phase 2 not run) - static pool only.
  }
  return entries;
}
