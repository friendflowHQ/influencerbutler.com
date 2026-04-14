function cleanEnvValue(value: string | undefined) {
  return value?.trim().replace(/^['"]|['"]$/g, "");
}

function extractFromBlob(blob: string, key: string) {
  const normalized = blob.replace(/\\n/g, "\n");
  const match = normalized.match(new RegExp(`${key}\\s*=\\s*([^\\n]+)`));
  return cleanEnvValue(match?.[1]);
}

export function getSupabaseEnv() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const blob = [rawUrl, rawAnon].filter(Boolean).join("\n");

  const url =
    cleanEnvValue(rawUrl)?.split(/\\n|\n/)[0] ||
    extractFromBlob(blob, "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = cleanEnvValue(rawAnon) || extractFromBlob(blob, "NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return { url, anonKey };
}
