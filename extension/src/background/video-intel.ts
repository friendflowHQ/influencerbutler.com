import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import type { VideoIntelResult } from "../shared/messages";

// Per-video "passport" read from the shared video-placement pool. The content
// script cannot hold the license key or hit our origin directly, so it asks the
// worker, which GETs /api/extension/video-intel with the Bearer token. Reading
// the pool is open to any signed-in user (contribution is the opt-in part).

const EMPTY: VideoIntelResult = {
  ok: false,
  collecting: true,
  firstSeen: null,
  daysTracked: 0,
  activeDays: 0,
  productReach: 0,
  upperShare: null,
  lowerShare: null,
  presenceRate: null,
  rotationRate: null,
  stability: null,
  activeDayStrength: null,
  series: [],
  snapshot: [],
  lastObserved: null,
};

export async function getVideoIntel(
  videoId: string,
  marketplace: string,
): Promise<VideoIntelResult> {
  const state = await getState();
  const key = state.auth.licenseKey;
  if (!key || !videoId) return EMPTY;

  const url = `${ENDPOINTS.videoIntel}?videoId=${encodeURIComponent(videoId)}&marketplace=${encodeURIComponent(marketplace)}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const data = (await res.json().catch(() => null)) as
      | (Partial<VideoIntelResult> & { migrationPending?: boolean })
      | null;
    if (data?.migrationPending) return { ...EMPTY, migrationPending: true };
    if (!res.ok || !data || !data.ok) return EMPTY;
    return { ...EMPTY, ...data, ok: true };
  } catch {
    return EMPTY;
  }
}
