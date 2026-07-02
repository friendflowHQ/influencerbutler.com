"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Lists the devices (Lemon Squeezy license instances) a user's key is
 * activated on and lets them free up a seat. Self-fetching so it can drop
 * into any dashboard page; renders nothing until the list loads and stays
 * quiet (single line) when Lemon Squeezy is unreachable.
 */

type Instance = {
  identifier: string;
  name: string | null;
  createdAt: string | null;
};

type ActivationsResponse = {
  activationLimit?: number | null;
  instances?: Instance[] | null;
  error?: string;
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export default function DeviceManager() {
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [activationLimit, setActivationLimit] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/license/activations", { cache: "no-store" });
      if (!res.ok) {
        setUnavailable(true);
        return;
      }
      const json = (await res.json()) as ActivationsResponse;
      if (json.instances === null) {
        setUnavailable(true);
        return;
      }
      setInstances(json.instances ?? []);
      setActivationLimit(json.activationLimit ?? null);
    } catch {
      setUnavailable(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deactivate = async (identifier: string) => {
    setBusy(identifier);
    setActionError(null);
    try {
      const res = await fetch("/api/me/license/activations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deactivate", instanceId: identifier }),
      });
      const json = (await res.json()) as ActivationsResponse & { ok?: boolean };
      if (!res.ok || !json.ok) {
        setActionError(json.error ?? "Deactivation failed. Try again shortly.");
        return;
      }
      setInstances(json.instances ?? []);
    } catch {
      setActionError("Network error. Try again shortly.");
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  if (!loaded) return null;

  if (unavailable) {
    return (
      <p className="text-xs text-slate-400">Could not load your activated devices right now.</p>
    );
  }

  const countLine =
    activationLimit !== null
      ? `${instances.length} of ${activationLimit} devices in use`
      : `${instances.length} ${instances.length === 1 ? "device" : "devices"} in use`;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Your devices</h2>
        <span className="text-xs text-slate-500">{countLine}</span>
      </div>

      {instances.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          No devices activated yet. Download the app and paste your license key to get started.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {instances.map((inst) => {
            const activated = formatDate(inst.createdAt);
            const isConfirming = confirming === inst.identifier;
            const isBusy = busy === inst.identifier;
            return (
              <li
                key={inst.identifier}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {inst.name || "Unnamed device"}
                  </p>
                  {activated ? (
                    <p className="text-xs text-slate-500">Activated {activated}</p>
                  ) : null}
                </div>
                {isConfirming ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-slate-600">
                      Free up this seat? The app on that device will ask for the key again.
                    </span>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void deactivate(inst.identifier)}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                    >
                      {isBusy ? "Removing..." : "Yes, deactivate"}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setConfirming(null)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(inst.identifier);
                      setActionError(null);
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Deactivate
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {actionError ? <p className="mt-2 text-xs text-rose-600">{actionError}</p> : null}
    </article>
  );
}
