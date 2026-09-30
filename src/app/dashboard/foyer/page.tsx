"use client";

import { useCallback, useEffect, useState } from "react";

type Subscriber = {
  id: number;
  email: string;
  status: "active" | "unsubscribed";
  tags: string[];
  source: string;
  createdAt: number;
  unsubscribedAt: number | null;
  lastEmailedAt: number | null;
  totalOpens: number;
};

type SendSummary = {
  id: number;
  subject: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  createdAt: number;
};

type SendRecipient = {
  email: string;
  status: "sent" | "failed";
  deliveredAt: number | null;
  openedAt: number | null;
  clickedAt: number | null;
  openCount: number;
  clickCount: number;
};

function fmtDate(ms: number | null | undefined) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleDateString();
  } catch {
    return "";
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    const json = await res.json().catch(() => null);
    if (!res.ok || (json && json.ok === false)) {
      return { ok: false, status: res.status, data: null, error: (json && json.error) || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, data: json as T };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : "Network error" };
  }
}

export default function FoyerSubscribersPage() {
  const [tab, setTab] = useState<"contacts" | "sends">("contacts");
  const [noLicense, setNoLicense] = useState(false);

  // Contacts tab state.
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subsCursor, setSubsCursor] = useState<number | null>(null);
  const [subsLoading, setSubsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkTag, setBulkTag] = useState("");

  // Sends tab state.
  const [sends, setSends] = useState<SendSummary[]>([]);
  const [sendsCursor, setSendsCursor] = useState<number | null>(null);
  const [sendsLoading, setSendsLoading] = useState(true);
  const [openSend, setOpenSend] = useState<SendSummary | null>(null);
  const [recipients, setRecipients] = useState<SendRecipient[]>([]);

  const loadSubscribers = useCallback(
    async (reset: boolean) => {
      setSubsLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (tagFilter) params.set("tag", tagFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (!reset && subsCursor) params.set("cursor", String(subsCursor));
      const res = await fetchJson<{ subscribers: Subscriber[]; nextCursor: number | null }>(
        `/api/me/foyer/newsletter/subscribers?${params.toString()}`,
      );
      if (res.status === 404) setNoLicense(true);
      if (res.ok && res.data) {
        setSubscribers((prev) => (reset ? res.data!.subscribers : [...prev, ...res.data!.subscribers]));
        setSubsCursor(res.data.nextCursor);
        if (reset) setSelected(new Set());
      }
      setSubsLoading(false);
    },
    [search, tagFilter, statusFilter, subsCursor],
  );

  const loadSends = useCallback(
    async (reset: boolean) => {
      setSendsLoading(true);
      const params = new URLSearchParams();
      if (!reset && sendsCursor) params.set("cursor", String(sendsCursor));
      const res = await fetchJson<{ sends: SendSummary[]; nextCursor: number | null }>(`/api/me/foyer/newsletter/sends?${params.toString()}`);
      if (res.status === 404) setNoLicense(true);
      if (res.ok && res.data) {
        setSends((prev) => (reset ? res.data!.sends : [...prev, ...res.data!.sends]));
        setSendsCursor(res.data.nextCursor);
      }
      setSendsLoading(false);
    },
    [sendsCursor],
  );

  useEffect(() => {
    void loadSubscribers(true);
    void loadSends(true);
    // Only on mount -- filter changes are re-triggered explicitly below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadSubscribers(true), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tagFilter, statusFilter]);

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkAction = async (action: "tag" | "untag" | "unsubscribe") => {
    if (!selected.size) return;
    if ((action === "tag" || action === "untag") && !bulkTag.trim()) return;
    await fetchJson("/api/me/foyer/newsletter/subscribers/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], action, tag: bulkTag.trim() || undefined }),
    });
    setBulkTag("");
    void loadSubscribers(true);
  };

  const unsubscribeOne = async (id: number) => {
    await fetchJson(`/api/me/foyer/newsletter/subscribers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "unsubscribed" }),
    });
    void loadSubscribers(true);
  };

  const openRecipients = async (send: SendSummary) => {
    setOpenSend(send);
    setRecipients([]);
    const res = await fetchJson<{ recipients: SendRecipient[] }>(`/api/me/foyer/newsletter/sends/${send.id}/recipients`);
    if (res.ok && res.data) setRecipients(res.data.recipients);
  };

  if (noLicense) {
    return (
      <section className="space-y-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Foyer Subscribers</h1>
        </header>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          We could not find an activated license on this account yet. Sign in to the desktop app and publish a Foyer page
          first, then come back here to manage your subscribers.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Foyer Subscribers</h1>
        <p className="mt-1 text-sm text-slate-600">
          Everyone who has signed up on your Foyer page, who you&apos;ve emailed and when, who opened it, and your tags.
        </p>
      </header>

      <div className="flex gap-2 border-b border-slate-200">
        {(["contacts", "sends"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === key ? "border-b-2 border-[#f97316] text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {key === "contacts" ? "Contacts" : "Send history"}
          </button>
        ))}
      </div>

      {tab === "contacts" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="unsubscribed">Unsubscribed</option>
            </select>
            <input
              type="text"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder="Filter by tag"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
            />
          </div>

          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-orange-50 p-3">
              <span className="text-sm text-slate-700">{selected.size} selected</span>
              <input
                type="text"
                value={bulkTag}
                onChange={(e) => setBulkTag(e.target.value)}
                placeholder="Tag name"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
              />
              <button
                type="button"
                onClick={() => void bulkAction("tag")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Add tag
              </button>
              <button
                type="button"
                onClick={() => void bulkAction("untag")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Remove tag
              </button>
              <button
                type="button"
                onClick={() => void bulkAction("unsubscribe")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Unsubscribe selected
              </button>
            </div>
          ) : null}

          <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2"></th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Tags</th>
                  <th className="px-3 py-2">Joined</th>
                  <th className="px-3 py-2">Last emailed</th>
                  <th className="px-3 py-2">Opens</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelected(s.id)} />
                    </td>
                    <td className="px-3 py-2 break-all">{s.email}</td>
                    <td className="px-3 py-2">
                      {s.tags.map((tag) => (
                        <span key={tag} className="mr-1 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                          {tag}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{fmtDate(s.createdAt)}</td>
                    <td className="px-3 py-2 text-slate-500">{s.lastEmailedAt ? fmtDate(s.lastEmailedAt) : "Never"}</td>
                    <td className="px-3 py-2 text-slate-500">{s.totalOpens}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {s.status === "active" ? "Active" : "Unsubscribed"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {s.status === "active" ? (
                        <button type="button" onClick={() => void unsubscribeOne(s.id)} className="text-xs text-slate-500 underline hover:text-orange-600">
                          Unsubscribe
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!subsLoading && subscribers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-500">
                      No subscribers match.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {subsCursor ? (
            <button
              type="button"
              onClick={() => void loadSubscribers(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Load more
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2">Recipients</th>
                  <th className="px-3 py-2">Delivered</th>
                  <th className="px-3 py-2">Opened</th>
                  <th className="px-3 py-2">Clicked</th>
                </tr>
              </thead>
              <tbody>
                {sends.map((s) => (
                  <tr key={s.id} onClick={() => void openRecipients(s)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-orange-50">
                    <td className="px-3 py-2">{s.subject}</td>
                    <td className="px-3 py-2 text-slate-500">{fmtDate(s.createdAt)}</td>
                    <td className="px-3 py-2 text-slate-500">{s.recipientCount}</td>
                    <td className="px-3 py-2 text-slate-500">{s.deliveredCount}</td>
                    <td className="px-3 py-2 text-slate-500">{s.openedCount}</td>
                    <td className="px-3 py-2 text-slate-500">{s.clickedCount}</td>
                  </tr>
                ))}
                {!sendsLoading && sends.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                      No sends yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {sendsCursor ? (
            <button
              type="button"
              onClick={() => void loadSends(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Load more
            </button>
          ) : null}

          {openSend ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">{openSend.subject}</h2>
              <div className="mt-3 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Delivered</th>
                      <th className="px-3 py-2">Opened</th>
                      <th className="px-3 py-2">Clicked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((r) => (
                      <tr key={r.email} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 break-all">{r.email}</td>
                        <td className="px-3 py-2 text-slate-500">{r.status === "sent" ? "Sent" : "Failed"}</td>
                        <td className="px-3 py-2 text-slate-500">{r.deliveredAt ? fmtDate(r.deliveredAt) : "—"}</td>
                        <td className="px-3 py-2 text-slate-500">{r.openCount > 0 ? `${fmtDate(r.openedAt)} (${r.openCount})` : "—"}</td>
                        <td className="px-3 py-2 text-slate-500">{r.clickCount > 0 ? `${fmtDate(r.clickedAt)} (${r.clickCount})` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
