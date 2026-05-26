"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  avatar_updated_at: string | null;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const AVATAR_GIF_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_RASTER_MAX_BYTES = 10 * 1024 * 1024;
const AVATAR_ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const AVATAR_TARGET_MAX_DIM = 512;
const AVATAR_WEBP_QUALITY = 0.85;

type DecodedSource =
  | { kind: "bitmap"; bitmap: ImageBitmap; width: number; height: number }
  | { kind: "image"; image: HTMLImageElement; width: number; height: number; revoke: () => void };

async function decodeAvatar(file: File): Promise<DecodedSource> {
  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width && bitmap.height) {
      return { kind: "bitmap", bitmap, width: bitmap.width, height: bitmap.height };
    }
    bitmap.close();
  } catch (err) {
    console.warn("createImageBitmap failed, falling back to <img>", err);
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image element decode failed."));
      el.src = url;
    });
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    if (!w || !h) {
      URL.revokeObjectURL(url);
      throw new Error("Could not read image dimensions.");
    }
    return { kind: "image", image, width: w, height: h, revoke: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    console.error("avatar decode failed", err);
    throw new Error("Could not decode that image. Try saving it again as PNG or JPEG.");
  }
}

async function resizeAvatarFile(file: File): Promise<File> {
  if (file.type === "image/gif") return file;

  const decoded = await decodeAvatar(file);
  try {
    const { width: w, height: h } = decoded;
    const scale = Math.min(1, AVATAR_TARGET_MAX_DIM / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const useOffscreen = typeof OffscreenCanvas !== "undefined";
    const canvas: OffscreenCanvas | HTMLCanvasElement = useOffscreen
      ? new OffscreenCanvas(outW, outH)
      : Object.assign(document.createElement("canvas"), { width: outW, height: outH });
    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error("Canvas not available in this browser.");
    const source = decoded.kind === "bitmap" ? decoded.bitmap : decoded.image;
    ctx.drawImage(source, 0, 0, outW, outH);

    const blob: Blob | null = await (canvas instanceof OffscreenCanvas
      ? canvas.convertToBlob({ type: "image/webp", quality: AVATAR_WEBP_QUALITY })
      : new Promise<Blob | null>((resolve) =>
          (canvas as HTMLCanvasElement).toBlob(
            (b) => resolve(b),
            "image/webp",
            AVATAR_WEBP_QUALITY,
          ),
        ));
    if (!blob) throw new Error("Could not re-encode image.");

    return new File([blob], "avatar.webp", { type: "image/webp" });
  } finally {
    if (decoded.kind === "bitmap") decoded.bitmap.close();
    else decoded.revoke();
  }
}

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUpdatedAt, setAvatarUpdatedAt] = useState<string | null>(null);

  const [identityStatus, setIdentityStatus] = useState<SaveStatus>("idle");
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [usernameTaken, setUsernameTaken] = useState<boolean | null>(null);
  const [usernameInvalid, setUsernameInvalid] = useState(false);

  const [pendingEmail, setPendingEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<SaveStatus>("idle");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailConfirmationPending, setEmailConfirmationPending] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<SaveStatus>("idle");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [signingOutEverywhere, setSigningOutEverywhere] = useState(false);

  const identityDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usernameCheckSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) {
          if (!cancelled) setLoadError("Please sign in to view your profile.");
          return;
        }
        if (cancelled) return;
        setUserId(user.id);
        setEmail(user.email ?? "");
        setPendingEmail(user.email ?? "");

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url, avatar_updated_at")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        const row = (profile ?? null) as ProfileRow | null;
        setDisplayName(row?.display_name ?? "");
        setUsername(row?.username ?? "");
        setAvatarUrl(row?.avatar_url ?? null);
        setAvatarUpdatedAt(row?.avatar_updated_at ?? null);
      } catch (err) {
        console.error("profile load failed", err);
        if (!cancelled) setLoadError("Network error. Please refresh to try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const saveIdentity = useCallback(
    async (next: { displayName: string; username: string }) => {
      if (!userId) return;
      const trimmedUsername = next.username.trim();
      const trimmedDisplayName = next.displayName.trim();

      if (trimmedUsername.length > 0 && !USERNAME_RE.test(trimmedUsername)) {
        setUsernameInvalid(true);
        setIdentityStatus("error");
        setIdentityError("Username must be 3–32 chars, letters/numbers/_/- only.");
        return;
      }
      setUsernameInvalid(false);
      setIdentityStatus("saving");
      setIdentityError(null);

      if (trimmedUsername.length > 0) {
        const seq = ++usernameCheckSeq.current;
        const { data: clash } = await supabase
          .from("profiles")
          .select("id")
          .ilike("username", trimmedUsername)
          .neq("id", userId)
          .maybeSingle();
        if (seq !== usernameCheckSeq.current) return;
        if (clash) {
          setUsernameTaken(true);
          setIdentityStatus("error");
          setIdentityError("That username is taken.");
          return;
        }
        setUsernameTaken(false);
      } else {
        setUsernameTaken(null);
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: trimmedDisplayName.length > 0 ? trimmedDisplayName : null,
          username: trimmedUsername.length > 0 ? trimmedUsername : null,
        })
        .eq("id", userId);
      if (error) {
        setIdentityStatus("error");
        setIdentityError(error.message || "Could not save changes.");
        return;
      }
      setIdentityStatus("saved");
      setIdentityError(null);
    },
    [supabase, userId],
  );

  useEffect(() => {
    if (loading || !userId) return;
    if (identityDebounce.current) clearTimeout(identityDebounce.current);
    identityDebounce.current = setTimeout(() => {
      void saveIdentity({ displayName, username });
    }, 400);
    return () => {
      if (identityDebounce.current) clearTimeout(identityDebounce.current);
    };
  }, [displayName, username, userId, loading, saveIdentity]);

  const handleAvatarChange = async (file: File) => {
    if (!userId) return;
    setAvatarError(null);
    if (!AVATAR_ALLOWED_MIME.includes(file.type)) {
      setAvatarError("Choose a PNG, JPEG, WEBP, or GIF.");
      return;
    }
    if (file.type === "image/gif") {
      if (file.size > AVATAR_GIF_MAX_BYTES) {
        setAvatarError("Animated GIF must be under 2 MB.");
        return;
      }
    } else if (file.size > AVATAR_RASTER_MAX_BYTES) {
      setAvatarError("Image must be under 10 MB.");
      return;
    }
    setAvatarUploading(true);
    try {
      const uploadFile = await resizeAvatarFile(file);
      const ext = uploadFile.type === "image/webp" ? "webp" : "gif";
      const path = `${userId}/avatar.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, uploadFile, {
          upsert: true,
          contentType: uploadFile.type,
          cacheControl: "0",
        });
      if (uploadErr) throw uploadErr;
      const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path);
      const now = new Date().toISOString();
      const publicUrl = publicData.publicUrl;
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl, avatar_updated_at: now })
        .eq("id", userId);
      if (updateErr) throw updateErr;
      setAvatarUrl(publicUrl);
      setAvatarUpdatedAt(now);
    } catch (err) {
      console.error("avatar upload failed", err);
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setAvatarError(msg);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleEmailChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingEmail || pendingEmail === email) return;
    setEmailStatus("saving");
    setEmailError(null);
    const { error } = await supabase.auth.updateUser({ email: pendingEmail });
    if (error) {
      setEmailStatus("error");
      setEmailError(error.message);
      return;
    }
    setEmailStatus("saved");
    setEmailConfirmationPending(true);
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError("Use at least 8 characters.");
      setPasswordStatus("error");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match.");
      setPasswordStatus("error");
      return;
    }
    setPasswordStatus("saving");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordStatus("error");
      setPasswordError(error.message);
      return;
    }
    setPasswordStatus("saved");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSignOutEverywhere = async () => {
    setSigningOutEverywhere(true);
    type ScopedSignOut = { auth: { signOut: (opts?: { scope?: "global" }) => Promise<unknown> } };
    await (supabase as unknown as ScopedSignOut).auth.signOut({ scope: "global" });
    window.location.href = "/";
  };

  const avatarCacheBusted = useMemo(() => {
    if (!avatarUrl) return null;
    const v = avatarUpdatedAt ? encodeURIComponent(avatarUpdatedAt) : Date.now().toString();
    return avatarUrl.includes("?") ? `${avatarUrl}&v=${v}` : `${avatarUrl}?v=${v}`;
  }, [avatarUrl, avatarUpdatedAt]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800 shadow-sm">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">Account</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Your profile
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Your display name and avatar appear next to your posts in community Q&amp;A on the website
          and in the Influencer Butler app.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Identity</h2>
        <p className="mt-1 text-sm text-slate-600">Changes save automatically as you type.</p>

        <div className="mt-6 flex items-center gap-4">
          <div className="relative h-16 w-16 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
            {avatarCacheBusted ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarCacheBusted}
                alt="Your avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-slate-400">
                {(displayName || email || "?").trim().charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              {avatarUploading ? "Uploading…" : avatarUrl ? "Replace avatar" : "Upload avatar"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                disabled={avatarUploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleAvatarChange(file);
                  event.target.value = "";
                }}
              />
            </label>
            <p className="mt-1 text-xs text-slate-500">
              PNG, JPG, or WEBP up to 10 MB — we resize automatically. Animated GIF up to 2 MB.
            </p>
            {avatarError ? (
              <p className="mt-1 text-xs text-red-600">{avatarError}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={60}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/30"
              placeholder="How you appear in the community"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              maxLength={32}
              className={[
                "mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm outline-none focus:ring-2",
                usernameInvalid || usernameTaken
                  ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                  : "border-slate-300 focus:border-[#f97316] focus:ring-[#f97316]/30",
              ].join(" ")}
              placeholder="letters, numbers, _ or - (3–32 chars)"
            />
            {usernameTaken ? (
              <p className="mt-1 text-xs text-red-600">That username is taken.</p>
            ) : usernameInvalid ? (
              <p className="mt-1 text-xs text-red-600">
                Use 3–32 characters: letters, numbers, _ or -.
              </p>
            ) : null}
          </label>
        </div>

        <p className="mt-4 text-xs text-slate-500" aria-live="polite">
          {identityStatus === "saving"
            ? "Saving…"
            : identityStatus === "saved"
              ? "Saved."
              : identityStatus === "error"
                ? identityError || "Could not save."
                : " "}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Email</h2>
        <p className="mt-1 text-sm text-slate-600">
          Used to sign in to this dashboard. <strong>Heads up:</strong> changing this does not change
          the email tied to your Lemon Squeezy receipt or your desktop-app magic-link recipient —
          you&apos;ll need to update those separately if you want them to match.
        </p>
        <form className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center" onSubmit={handleEmailChange}>
          <input
            type="email"
            value={pendingEmail}
            onChange={(event) => {
              setPendingEmail(event.target.value);
              setEmailStatus("idle");
              setEmailConfirmationPending(false);
            }}
            required
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/30"
          />
          <button
            type="submit"
            disabled={emailStatus === "saving" || pendingEmail === email}
            className="inline-flex items-center justify-center rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-50"
          >
            {emailStatus === "saving" ? "Sending…" : "Update email"}
          </button>
        </form>
        {emailConfirmationPending ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Check your new inbox — Supabase sent a confirmation link. Your email won&apos;t change
            until you click it.
          </p>
        ) : emailStatus === "error" ? (
          <p className="mt-3 text-xs text-red-600">{emailError}</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Password</h2>
        <p className="mt-1 text-sm text-slate-600">
          Pick a new password — at least 8 characters.
        </p>
        <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={handlePasswordChange}>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setPasswordStatus("idle");
            }}
            placeholder="New password"
            autoComplete="new-password"
            required
            minLength={8}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/30"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setPasswordStatus("idle");
            }}
            placeholder="Confirm new password"
            autoComplete="new-password"
            required
            minLength={8}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/30"
          />
          <button
            type="submit"
            disabled={passwordStatus === "saving"}
            className="inline-flex items-center justify-center rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-50 sm:col-span-2 sm:w-fit"
          >
            {passwordStatus === "saving" ? "Saving…" : "Update password"}
          </button>
        </form>
        {passwordStatus === "saved" ? (
          <p className="mt-3 text-xs text-emerald-700">Password updated.</p>
        ) : passwordStatus === "error" ? (
          <p className="mt-3 text-xs text-red-600">{passwordError}</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-red-200 bg-red-50/50 p-5 sm:p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-red-900">Sign out everywhere</h2>
        <p className="mt-1 text-sm text-red-900/80">
          Revokes every active dashboard session for this account on every browser. You&apos;ll need
          to sign in again on each device.
        </p>
        <button
          type="button"
          onClick={handleSignOutEverywhere}
          disabled={signingOutEverywhere}
          className="mt-4 inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-500 hover:bg-red-50 disabled:opacity-50"
        >
          {signingOutEverywhere ? "Signing out…" : "Sign out everywhere"}
        </button>
      </section>
    </div>
  );
}
