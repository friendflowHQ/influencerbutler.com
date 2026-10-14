/** Shared between the event banner upload's start/confirm routes. */

export const EVENT_IMAGE_BUCKET = "event-images";

export const EXT_BY_IMAGE_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
