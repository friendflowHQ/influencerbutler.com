import { ENDPOINTS } from "../shared/constants";
import { getState, patchState } from "../storage/store";
import type { SignInResult } from "../shared/messages";

export async function signIn(licenseKey: string): Promise<SignInResult> {
  const trimmed = licenseKey.trim();
  if (trimmed.length < 8 || trimmed.length > 200) {
    return { ok: false, error: "That does not look like a license key." };
  }
  try {
    const response = await fetch(ENDPOINTS.authCheck, {
      method: "POST",
      headers: { Authorization: `Bearer ${trimmed}` },
    });
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 401
            ? "License key not recognized. Copy it from your welcome email or the dashboard."
            : "Could not verify right now. Try again in a minute.",
      };
    }
    const data = (await response.json()) as { email?: string };
    await patchState((state) => {
      state.auth = {
        licenseKey: trimmed,
        email: data.email ?? null,
        verifiedAt: Date.now(),
      };
    });
    return { ok: true, email: data.email };
  } catch {
    return { ok: false, error: "Network error verifying the key. Are you online?" };
  }
}

export async function signOut(): Promise<void> {
  await patchState((state) => {
    state.auth = { licenseKey: null, email: null, verifiedAt: null };
    state.queue = [];
  });
}

export async function authSnapshot(): Promise<{ signedIn: boolean; email: string | null }> {
  const state = await getState();
  return { signedIn: Boolean(state.auth.licenseKey), email: state.auth.email };
}
