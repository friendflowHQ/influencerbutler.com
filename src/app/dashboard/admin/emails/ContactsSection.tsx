"use client";

// Contacts tab of the admin Emails page: browse/search/filter the marketing
// contact list, import pasted addresses with tags, and run bulk tag/untag/
// unsubscribe actions on selected rows.

import { useCallback, useEffect, useState } from "react";

type ContactRow = {
  email: string;
  source: string;
  tags: string[];
  created_at: string;
  unsubscribed_at: string | null;
};

type ContactsResponse = {
  rows: ContactRow[];
  total: number;
  tagCounts: Record<string, number>;
  page: number;
  pageSize: number;
  migrationPending: boolean;
};

type ImportResult = {
  added: number;
  existingTagged: number;
  invalid: number;
  total: number;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

// The server import caps at 2000 addresses per request; large pastes are split
// into sequential batches client-side so thousands can be loaded in one go.
const IMPORT_BATCH = 2000;

/** Splits a pasted blob into deduped, lowercased email tokens. */
function parseImportEmails(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@")),
    ),
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function ContactsSection({
  onOpenCustomer,
}: {
  onOpenCustomer: (email: string) => void;
}) {
  const [data, setData] = useState<ContactsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [page, setPage] = useState(0);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Mutations require the marketing.send permission; viewing keeps working.
  const [mutationForbidden, setMutationForbidden] = useState(false);

  // Import panel
  const [importOpen, setImportOpen] = useState(false);
  const [importEmails, setImportEmails] = useState("");
  const [importTagsInput, setImportTagsInput] = useState("");
  const [importSource, setImportSource] = useState("");
  const [importSync, setImportSync] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);

  // Selection + bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (query) params.set("query", query);
      if (tagFilter) params.set("tag", tagFilter);
      const res = await fetch(`/api/admin/emails/contacts?${params}`, { cache: "no-store" });
      if (!res.ok) {
        setLoadError(`Could not load contacts (HTTP ${res.status}).`);
        return;
      }
      setData((await res.json()) as ContactsResponse);
    } catch {
      setLoadError("Could not load contacts. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [page, query, tagFilter]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function submitImport() {
    setImportBusy(true);
    setImportError(null);
    setImportResult(null);
    setImportProgress(null);
    try {
      const allEmails = parseImportEmails(importEmails);
      if (allEmails.length === 0) {
        setImportError("No valid email addresses found.");
        return;
      }
      const tags = parseTags(importTagsInput);
      const source = importSource.trim();
      const batches = chunk(allEmails, IMPORT_BATCH);
      // Accumulate across batches so the final result reflects the whole paste.
      const totals: ImportResult = { added: 0, existingTagged: 0, invalid: 0, total: 0 };

      for (let i = 0; i < batches.length; i++) {
        if (batches.length > 1) {
          setImportProgress(`Importing batch ${i + 1} of ${batches.length}...`);
        }
        const body: {
          emails: string;
          tags?: string[];
          source?: string;
          syncToResendAudience?: boolean;
        } = { emails: batches[i].join("\n") };
        if (tags.length > 0) body.tags = tags;
        if (source) body.source = source;
        if (importSync) body.syncToResendAudience = true;

        const res = await fetch("/api/admin/emails/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.status === 403) {
          setMutationForbidden(true);
          return;
        }
        if (res.status === 409) {
          setImportError(
            "The contacts table is missing. Apply supabase/migrations/20260817_email_marketing.sql first.",
          );
          return;
        }
        if (!res.ok) {
          setImportError(
            `Import failed on batch ${i + 1} of ${batches.length} (HTTP ${res.status}). ` +
              `${totals.added} contacts were added before the error.`,
          );
          return;
        }
        const r = (await res.json()) as ImportResult;
        totals.added += r.added ?? 0;
        totals.existingTagged += r.existingTagged ?? 0;
        totals.invalid += r.invalid ?? 0;
        totals.total += r.total ?? 0;
      }

      setImportResult(totals);
      setImportEmails("");
      void refetch();
    } catch {
      setImportError("Import failed. Check your connection and try again.");
    } finally {
      setImportBusy(false);
      setImportProgress(null);
    }
  }

  async function bulkAction(action: "tag" | "untag" | "unsubscribe") {
    const emails = Array.from(selected);
    if (emails.length === 0) return;
    const tag = parseTags(bulkTagInput)[0];
    if ((action === "tag" || action === "untag") && !tag) {
      setBulkError("Enter a tag first.");
      return;
    }
    if (
      action === "unsubscribe" &&
      !window.confirm(`Unsubscribe ${emails.length} contact(s)? They will stop getting marketing email.`)
    ) {
      return;
    }
    setBulkBusy(true);
    setBulkError(null);
    try {
      const res = await fetch("/api/admin/emails/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "unsubscribe" ? { action, emails } : { action, emails, tag },
        ),
      });
      if (res.status === 403) {
        setMutationForbidden(true);
        return;
      }
      if (!res.ok) {
        setBulkError(`Action failed (HTTP ${res.status}).`);
        return;
      }
      setSelected(new Set());
      setBulkTagInput("");
      void refetch();
    } catch {
      setBulkError("Action failed. Check your connection and try again.");
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleSelected(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  const rows = data?.rows ?? [];
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.email));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const tagEntries = Object.entries(data?.tagCounts ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <section className="mt-6">
      {data?.migrationPending ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          The email marketing tables are missing. Apply
          supabase/migrations/20260817_email_marketing.sql to prod to enable contacts, campaigns,
          and sequences.
        </div>
      ) : null}

      {mutationForbidden ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          You need the marketing.send permission to import, tag, or unsubscribe contacts. Viewing
          still works.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Contacts</h2>
        <div className="flex flex-wrap items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              setQuery(queryInput.trim());
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search by email..."
              className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Search
            </button>
          </form>
          {!mutationForbidden ? (
            <button
              type="button"
              onClick={() => setImportOpen((v) => !v)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              {importOpen ? "Close import" : "Import contacts"}
            </button>
          ) : null}
        </div>
      </div>

      {tagEntries.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tagEntries.map(([tag, count]) => (
            <button
              key={tag}
              type="button"
              onClick={() => {
                setPage(0);
                setTagFilter((prev) => (prev === tag ? null : tag));
              }}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                tagFilter === tag
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tag} ({count.toLocaleString("en-US")})
            </button>
          ))}
        </div>
      ) : null}

      {importOpen && !mutationForbidden ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">Import contacts</h3>
          <textarea
            value={importEmails}
            onChange={(e) => setImportEmails(e.target.value)}
            rows={6}
            placeholder="Paste emails separated by commas, spaces, or new lines..."
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-500">Tags (comma-separated)</label>
              <input
                type="text"
                value={importTagsInput}
                onChange={(e) => setImportTagsInput(e.target.value)}
                placeholder="vip, webinar-june"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
              />
              {parseTags(importTagsInput).length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {parseTags(importTagsInput).map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Source (optional)</label>
              <input
                type="text"
                value={importSource}
                onChange={(e) => setImportSource(e.target.value)}
                placeholder="manual-import"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
              />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={importSync}
              onChange={(e) => setImportSync(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Also add to the weekly newsletter list (Resend)
          </label>
          <p className="mt-2 text-xs text-slate-500">
            Only import addresses that gave you permission. Large pastes are imported automatically in
            batches of {IMPORT_BATCH.toLocaleString("en-US")}. For a cold or old list, verify it first
            and let the sequence throttle the sending pace.
          </p>
          {(() => {
            const count = parseImportEmails(importEmails).length;
            return count > 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                {count.toLocaleString("en-US")} address{count === 1 ? "" : "es"} detected
                {count > IMPORT_BATCH
                  ? ` (${Math.ceil(count / IMPORT_BATCH)} batches)`
                  : ""}
                .
              </p>
            ) : null;
          })()}
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void submitImport()}
              disabled={importBusy || importEmails.trim().length === 0}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
            >
              {importBusy ? "Importing..." : "Import"}
            </button>
            {importProgress ? (
              <span className="text-sm text-slate-500">{importProgress}</span>
            ) : null}
            {importResult ? (
              <span className="text-sm text-emerald-700">
                {importResult.added} added, {importResult.existingTagged} updated,{" "}
                {importResult.invalid} invalid
              </span>
            ) : null}
            {importError ? <span className="text-sm text-rose-600">{importError}</span> : null}
          </div>
        </div>
      ) : null}

      {selected.size > 0 && !mutationForbidden ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <span className="text-sm font-medium text-indigo-800">
            {selected.size} selected
          </span>
          <input
            type="text"
            value={bulkTagInput}
            onChange={(e) => setBulkTagInput(e.target.value)}
            placeholder="tag name"
            className="w-40 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void bulkAction("tag")}
            disabled={bulkBusy}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Tag
          </button>
          <button
            type="button"
            onClick={() => void bulkAction("untag")}
            disabled={bulkBusy}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Untag
          </button>
          <button
            type="button"
            onClick={() => void bulkAction("unsubscribe")}
            disabled={bulkBusy}
            className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
          >
            Unsubscribe
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700"
          >
            Clear
          </button>
          {bulkError ? <span className="text-sm text-rose-600">{bulkError}</span> : null}
        </div>
      ) : null}

      {loadError ? <p className="mt-3 text-sm text-rose-600">{loadError}</p> : null}

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <th className="w-8 px-4 py-2.5 font-medium">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={() => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (allOnPageSelected) rows.forEach((r) => next.delete(r.email));
                      else rows.forEach((r) => next.add(r.email));
                      return next;
                    });
                  }}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Tags</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">Added</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.email} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(row.email)}
                    onChange={() => toggleSelected(row.email)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </td>
                <td className="px-4 py-2 text-slate-800">
                  <button
                    type="button"
                    onClick={() => onOpenCustomer(row.email)}
                    className="text-left underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-indigo-600"
                    title={`Everything about ${row.email}`}
                  >
                    {row.email}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <span className="flex flex-wrap gap-1">
                    {row.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      >
                        {t}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{row.source}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                  {fmtDate(row.created_at)}
                </td>
                <td className="px-4 py-2">
                  {row.unsubscribed_at ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      unsubscribed
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      subscribed
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                  {query || tagFilter
                    ? "No contacts match the current filters."
                    : "No contacts yet. Use Import contacts to add your first batch."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {loading ? <div className="h-24 animate-pulse bg-slate-50" /> : null}
      </div>

      {data && data.total > data.pageSize ? (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {totalPages} ({data.total.toLocaleString("en-US")} contacts)
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}
