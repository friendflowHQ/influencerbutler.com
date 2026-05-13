"use client";

import { useEffect, useState } from "react";

type KeyRow = {
  id: string;
  prefix: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp-keys", { cache: "no-store" });
      if (!res.ok) throw new Error(`load failed (${res.status})`);
      const json = (await res.json()) as { keys: KeyRow[] };
      setKeys(json.keys ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setCreating(true);
    setError(null);
    setNewToken(null);
    try {
      const res = await fetch("/api/mcp-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error(`create failed (${res.status})`);
      const json = (await res.json()) as { token: string };
      setNewToken(json.token);
      setLabel("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "create failed");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("Revoke this API key? Clients using it will stop working immediately.")) return;
    try {
      const res = await fetch(`/api/mcp-keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`revoke failed (${res.status})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "revoke failed");
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">MCP API Keys</h1>
        <p className="mt-1 text-sm text-slate-600">
          Personal access tokens for the Influencer Butler MCP server. Use these from Claude Desktop,
          Claude Code, or any MCP-compatible client to call your authenticated tools.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Endpoint: <code className="rounded bg-slate-100 px-1 py-0.5">https://www.influencerbutler.com/api/mcp</code>
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Create a new key</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Claude Desktop)"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
          />
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#ea580c] disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create key"}
          </button>
        </div>

        {newToken ? (
          <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm">
            <p className="font-semibold text-emerald-900">New token — copy it now, you won&apos;t see it again:</p>
            <code className="mt-2 block break-all rounded bg-white px-2 py-1 font-mono text-xs text-emerald-900">
              {newToken}
            </code>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Your keys</h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No keys yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {k.label || <span className="italic text-slate-500">(no label)</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    <code className="font-mono">{k.prefix}…</code> · created{" "}
                    {new Date(k.created_at).toLocaleDateString()}
                    {k.revoked_at ? <span className="ml-2 text-red-600">revoked</span> : null}
                  </p>
                </div>
                {!k.revoked_at ? (
                  <button
                    type="button"
                    onClick={() => revoke(k.id)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
