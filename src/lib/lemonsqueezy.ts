const LS_API_BASE_URL = "https://api.lemonsqueezy.com/v1";

export async function lsApi(path: string, options: RequestInit = {}) {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;

  if (!apiKey) {
    throw new Error("Missing LEMONSQUEEZY_API_KEY environment variable");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return fetch(`${LS_API_BASE_URL}${normalizedPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      ...(options.headers ?? {}),
    },
  });
}
