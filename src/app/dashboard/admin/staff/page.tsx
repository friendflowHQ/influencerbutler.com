"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PERMISSIONS,
  PERMISSION_DOMAINS,
  type PermissionDef,
  type PermissionDomain,
} from "@/lib/permissions";

type Assistant = {
  id: string;
  user_id: string;
  email: string;
  role: string;
  permissions: string[] | null;
  is_active: boolean;
  label: string | null;
  invited_at: string | null;
  created_at: string;
};

type ListResponse = {
  admin?: { email: string };
  assistants?: Assistant[];
  superAdmins?: string[];
  error?: string;
};

// Permissions an assistant can actually be granted (exclude super-admin-only).
const GRANTABLE: PermissionDef[] = PERMISSIONS.filter((p) => !p.adminOnly);
const DOMAINS: PermissionDomain[] = PERMISSION_DOMAINS.filter((d) => d !== "Staff");

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function PermissionPicker({
  selected,
  onToggle,
  disabled,
}: {
  selected: Set<string>;
  onToggle: (key: string, on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {DOMAINS.map((domain) => {
        const items = GRANTABLE.filter((p) => p.domain === domain);
        if (items.length === 0) return null;
        return (
          <div key={domain} className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{domain}</p>
            <div className="mt-2 space-y-1.5">
              {items.map((p) => {
                const checked = selected.has(p.key);
                return (
                  <label
                    key={p.key}
                    className={[
                      "flex items-start gap-2 text-sm",
                      p.built ? "text-slate-700" : "text-slate-400",
                    ].join(" ")}
                    title={p.description}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={checked}
                      disabled={disabled || !p.built}
                      onChange={(e) => onToggle(p.key, e.target.checked)}
                    />
                    <span>
                      {p.label}
                      {p.risk !== "normal" ? (
                        <span
                          className={[
                            "ml-1 rounded px-1 py-0.5 text-[10px] font-semibold uppercase",
                            p.risk === "money"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700",
                          ].join(" ")}
                        >
                          {p.risk}
                        </span>
                      ) : null}
                      {!p.built ? (
                        <span className="ml-1 text-[10px] uppercase text-slate-400">soon</span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminStaffPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [superAdmins, setSuperAdmins] = useState<string[]>([]);

  // Invite form.
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLabel, setInviteLabel] = useState("");
  const [invitePerms, setInvitePerms] = useState<Set<string>>(new Set());
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  // Per-row edit.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/staff/list", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as ListResponse;
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setAssistants(json.assistants ?? []);
      setSuperAdmins(json.superAdmins ?? []);
    } catch (err) {
      console.error(err);
      setError("Network error. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onInvite = async () => {
    if (!inviteEmail.trim()) {
      setInviteMsg("Enter an email.");
      return;
    }
    setInviteBusy(true);
    setInviteMsg(null);
    try {
      const res = await fetch("/api/admin/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          label: inviteLabel.trim() || undefined,
          permissions: Array.from(invitePerms),
        }),
      });
      const json = (await res.json()) as { error?: string; created?: boolean; emailSent?: boolean };
      if (!res.ok) {
        setInviteMsg(json.error ?? `Failed (${res.status})`);
        return;
      }
      setInviteMsg(
        `Assistant ${json.created ? "created" : "added"}.${json.emailSent ? " Invite emailed." : " (Invite email not sent - check Resend config.)"}`,
      );
      setInviteEmail("");
      setInviteLabel("");
      setInvitePerms(new Set());
      void load();
    } catch (err) {
      console.error(err);
      setInviteMsg("Network error.");
    } finally {
      setInviteBusy(false);
    }
  };

  const startEdit = (a: Assistant) => {
    setEditingId(a.user_id);
    setEditPerms(new Set(a.permissions ?? []));
  };

  const saveEdit = async (a: Assistant) => {
    setRowBusy(a.user_id);
    try {
      const res = await fetch("/api/admin/staff/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: a.user_id, permissions: Array.from(editPerms) }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? `Save failed (${res.status})`);
        return;
      }
      setEditingId(null);
      void load();
    } finally {
      setRowBusy(null);
    }
  };

  const toggleActive = async (a: Assistant) => {
    setRowBusy(a.user_id);
    try {
      await fetch("/api/admin/staff/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: a.user_id, is_active: !a.is_active }),
      });
      void load();
    } finally {
      setRowBusy(null);
    }
  };

  const removeAssistant = async (a: Assistant) => {
    if (!window.confirm(`Remove ${a.email} as an assistant? This revokes all their admin access.`)) {
      return;
    }
    setRowBusy(a.user_id);
    try {
      await fetch("/api/admin/staff/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: a.user_id }),
      });
      void load();
    } finally {
      setRowBusy(null);
    }
  };

  const header = useMemo(
    () => (
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Admin · Assistants
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Assistant accounts &amp; permissions
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Invite assistants and grant each one only the capabilities they need. Super-admins (set via
          the ADMIN_EMAILS allowlist) always have full access.
        </p>
      </header>
    ),
    [],
  );

  if (forbidden) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Admin only</h1>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800 shadow-sm">
          Only super-admins can manage assistants.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {header}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {/* Invite */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Invite an assistant</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Email
            </span>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="assistant@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Label (optional)
            </span>
            <input
              type="text"
              value={inviteLabel}
              onChange={(e) => setInviteLabel(e.target.value)}
              placeholder="e.g. Billing VA"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Permissions
        </p>
        <PermissionPicker
          selected={invitePerms}
          disabled={inviteBusy}
          onToggle={(key, on) =>
            setInvitePerms((prev) => {
              const next = new Set(prev);
              if (on) next.add(key);
              else next.delete(key);
              return next;
            })
          }
        />

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onInvite}
            disabled={inviteBusy}
            className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
          >
            {inviteBusy ? "Inviting…" : "Invite assistant"}
          </button>
          {inviteMsg ? <span className="text-sm text-slate-600">{inviteMsg}</span> : null}
        </div>
      </section>

      {/* Assistants list */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Assistants</h2>
        {assistants.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
            No assistants yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {assistants.map((a) => {
              const editing = editingId === a.user_id;
              const busy = rowBusy === a.user_id;
              return (
                <li
                  key={a.user_id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 break-all">{a.email}</p>
                      <p className="text-xs text-slate-400">
                        {a.label ? `${a.label} · ` : ""}
                        {a.is_active ? "Active" : "Disabled"} · added {formatDate(a.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => toggleActive(a)}
                        disabled={busy}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {a.is_active ? "Disable" : "Enable"}
                      </button>
                      {editing ? (
                        <button
                          type="button"
                          onClick={() => saveEdit(a)}
                          disabled={busy}
                          className="rounded-lg bg-[#f97316] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#ea580c] disabled:opacity-60"
                        >
                          {busy ? "Saving…" : "Save"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(a)}
                          disabled={busy}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          Edit permissions
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAssistant(a)}
                        disabled={busy}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {editing ? (
                    <div className="mt-4">
                      <PermissionPicker
                        selected={editPerms}
                        disabled={busy}
                        onToggle={(key, on) =>
                          setEditPerms((prev) => {
                            const next = new Set(prev);
                            if (on) next.add(key);
                            else next.delete(key);
                            return next;
                          })
                        }
                      />
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(a.permissions ?? []).length === 0 ? (
                        <span className="text-xs text-slate-400">No permissions granted yet.</span>
                      ) : (
                        (a.permissions ?? []).map((p) => (
                          <span
                            key={p}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                          >
                            {p}
                          </span>
                        ))
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Super-admins (read-only) */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Super-admins</h2>
        <p className="text-sm text-slate-600">
          Full access, managed via the ADMIN_EMAILS environment variable (not editable here).
        </p>
        <ul className="flex flex-wrap gap-2">
          {superAdmins.map((e) => (
            <li
              key={e}
              className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700"
            >
              {e}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
