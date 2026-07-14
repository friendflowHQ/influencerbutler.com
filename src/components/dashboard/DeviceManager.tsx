"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Lists the devices (Lemon Squeezy license instances) a user's keys are
 * activated on, grouped per product when the user holds more than one key
 * (e.g. Team Pro + Daily Deals add-on), and lets them free up a seat.
 * In-house comp keys have no Lemon Squeezy instances; their groups carry
 * desktop check-in stamps (`comp`) and render an activity line instead of a
 * device list. Self-fetching so it can drop into any dashboard page; renders
 * nothing until the list loads and stays quiet (single line) when Lemon
 * Squeezy is unreachable.
 */

type Instance = {
  identifier: string;
  name: string | null;
  createdAt: string | null;
};

type CompActivity = {
  activatedAt: string | null;
  lastSeenAt: string | null;
};

type DeviceGroup = {
  lsLicenseKeyId: string;
  label: string | null;
  status: string | null;
  activationLimit: number | null;
  keyHint: string | null;
  instances: Instance[];
  comp: CompActivity | null;
};

type ActivationsResponse = {
  groups?: DeviceGroup[] | null;
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

function seatLine(group: DeviceGroup): string {
  // Comp keys have no per-device instance list; report check-in status instead.
  if (group.comp) {
    return group.comp.activatedAt ? "In use" : "Not activated yet";
  }
  const used = group.instances.length;
  if (group.activationLimit !== null && group.activationLimit > 0) {
    return `${used} of ${group.activationLimit} devices in use`;
  }
  return `${used} ${used === 1 ? "device" : "devices"} in use`;
}

/** Activity sentence for a comp key group ("Activated June 3, 2026 ..."). */
function compLine(comp: CompActivity): string {
  if (!comp.activatedAt) {
    return "Not activated yet. Download the app and paste this license key to get started.";
  }
  const activated = formatDate(comp.activatedAt);
  const lastSeen = formatDate(comp.lastSeenAt);
  const parts = [`Activated in the desktop app${activated ? ` on ${activated}` : ""}.`];
  if (lastSeen) parts.push(`Last check-in ${lastSeen}.`);
  return parts.join(" ");
}

export default function DeviceManager() {
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
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
      if (json.groups === null || json.groups === undefined) {
        setUnavailable(true);
        return;
      }
      setGroups(json.groups);
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
      setGroups(json.groups ?? []);
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

  if (groups.length === 0) return null;

  const multiProduct = groups.length > 1;
  // An activated comp key counts as one device: its seat is taken even though
  // Lemon Squeezy has no instance record for it.
  const totalDevices = groups.reduce(
    (n, g) => n + (g.comp ? (g.comp.activatedAt ? 1 : 0) : g.instances.length),
    0,
  );

  const deviceRow = (inst: Instance) => {
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
          {activated ? <p className="text-xs text-slate-500">Activated {activated}</p> : null}
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
  };

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Your devices</h2>
        {!multiProduct && groups[0] ? (
          <span className="text-xs text-slate-500">{seatLine(groups[0])}</span>
        ) : (
          <span className="text-xs text-slate-500">
            {totalDevices} {totalDevices === 1 ? "device" : "devices"} across your plans
          </span>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.lsLicenseKeyId} className={multiProduct ? "mt-4" : ""}>
          {multiProduct ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-1.5">
              <p className="text-sm font-semibold text-slate-800">
                {group.label ?? "License"}
                {group.keyHint ? (
                  <span className="ml-2 font-mono text-xs font-normal text-slate-400">
                    {group.keyHint}&hellip;
                  </span>
                ) : null}
                {group.status && group.status !== "active" ? (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {group.status}
                  </span>
                ) : null}
              </p>
              <span className="text-xs text-slate-500">{seatLine(group)}</span>
            </div>
          ) : null}
          {group.comp ? (
            <p className="mt-3 text-sm text-slate-600">{compLine(group.comp)}</p>
          ) : group.instances.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              No devices activated yet. Download the app and paste your license key to get started.
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-slate-100">{group.instances.map(deviceRow)}</ul>
          )}
        </div>
      ))}
      {actionError ? <p className="mt-2 text-xs text-rose-600">{actionError}</p> : null}
    </article>
  );
}
