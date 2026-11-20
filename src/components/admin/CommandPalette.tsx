"use client";

// Ctrl/Cmd+K command palette for staff: jump to any admin page, or run a quick
// lookup (find a user by email, search comps). Does nothing for non-staff: the
// identity check runs the first time it is opened, so regular customers never
// pay for it.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { visibleAdminNav } from "@/lib/admin-nav";

type Command = { id: string; label: string; hint: string; href: string };

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [identity, setIdentity] = useState<{ role: "admin" | "assistant" | null; perms: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
    returnFocusTo.current?.focus?.();
  }, []);

  // Resolves once with the caller's staff identity (role null = not staff).
  const identityPromise = useRef<Promise<{ role: "admin" | "assistant" | null; perms: string[] }> | null>(null);
  const ensureIdentity = useCallback(() => {
    if (!identityPromise.current) {
      identityPromise.current = fetch("/api/admin/whoami", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { isStaff?: boolean; role?: "admin" | "assistant" | null; permissions?: string[] } | null) =>
          j?.isStaff ? { role: j.role ?? null, perms: j.permissions ?? [] } : { role: null, perms: [] },
        )
        .catch(() => ({ role: null, perms: [] }));
      void identityPromise.current.then(setIdentity);
    }
    return identityPromise.current;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) return;
      // Customers keep the browser's own Ctrl+K: only staff get the palette.
      if (identity && !identity.role) return;
      e.preventDefault();
      returnFocusTo.current = document.activeElement as HTMLElement | null;
      void ensureIdentity().then((who) => {
        if (!who.role) return;
        setOpen((wasOpen) => !wasOpen);
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [identity, ensureIdentity]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    if (!identity?.role) return [];
    const q = query.trim();
    const lower = q.toLowerCase();
    const list: Command[] = [];
    if (q) {
      if (q.includes("@")) {
        list.push({
          id: "find-user",
          label: `Find user: ${q}`,
          hint: "Action",
          href: `/dashboard/admin/users?email=${encodeURIComponent(q)}`,
        });
      }
      list.push({
        id: "search-comps",
        label: `Search comps for "${q}"`,
        hint: "Action",
        href: `/dashboard/admin/comps?q=${encodeURIComponent(q)}`,
      });
    }
    for (const item of visibleAdminNav(identity.role, identity.perms)) {
      const hay = `${item.label} ${item.group} ${item.keywords ?? ""}`.toLowerCase();
      if (!lower || lower.split(/\s+/).every((word) => hay.includes(word))) {
        list.push({ id: item.href, label: item.label, hint: item.group, href: item.href });
      }
    }
    // Actions should not push matching pages off the list when the query is short.
    return list.slice(0, 12);
  }, [identity, query]);

  const go = useCallback(
    (cmd: Command | undefined) => {
      if (!cmd) return;
      setOpen(false);
      setQuery("");
      router.push(cmd.href);
    },
    [router],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(commands.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            go(commands[active]);
          }
        }}
      >
        <label className="block">
          <span className="sr-only">Search admin pages and actions</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Jump to a page, or type an email to find a user"
            role="combobox"
            aria-expanded="true"
            aria-controls="admin-cmd-list"
            aria-activedescendant={commands[active] ? `admin-cmd-${active}` : undefined}
            className="w-full border-b border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none"
          />
        </label>
        <ul id="admin-cmd-list" role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-1">
          {identity === null ? (
            <li className="px-3 py-3 text-sm text-slate-600">Loading...</li>
          ) : commands.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-600">
              {identity.role ? "No matches." : "Admin tools are only available to staff."}
            </li>
          ) : (
            commands.map((cmd, i) => (
              <li
                key={cmd.id}
                id={`admin-cmd-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(cmd)}
                className={[
                  "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                  i === active ? "bg-indigo-600 text-white" : "text-slate-800",
                ].join(" ")}
              >
                <span className="truncate">{cmd.label}</span>
                <span className={`shrink-0 text-xs ${i === active ? "text-indigo-100" : "text-slate-600"}`}>
                  {cmd.hint}
                </span>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-600">
          Up and down to move, Enter to open, Esc to close
        </p>
      </div>
    </div>
  );
}
