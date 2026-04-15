"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { useKeyboardShortcuts, type ShortcutDef } from "@/hooks/useKeyboardShortcuts";

type ShortcutRegistry = Map<string, ShortcutDef[]>;

type KeyboardShortcutsContextValue = {
  isHelpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  shortcuts: ShortcutDef[];
  registerShortcuts: (id: string, defs: ShortcutDef[]) => void;
  unregisterShortcuts: (id: string) => void;
};

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null);

export function useKeyboardShortcutsContext() {
  const ctx = useContext(KeyboardShortcutsContext);
  if (!ctx) {
    throw new Error("useKeyboardShortcutsContext must be used within KeyboardShortcutsProvider");
  }
  return ctx;
}

export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isHelpOpen, setHelpOpen] = useState(false);
  const [registry, setRegistry] = useState<ShortcutRegistry>(new Map());
  const prevPathRef = useRef(pathname);

  const registerShortcuts = useCallback((id: string, defs: ShortcutDef[]) => {
    setRegistry((prev) => {
      const next = new Map(prev);
      next.set(id, defs);
      return next;
    });
  }, []);

  const unregisterShortcuts = useCallback((id: string) => {
    setRegistry((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Global shortcuts
  const globalShortcuts = useMemo<ShortcutDef[]>(
    () => [
      {
        key: "?",
        handler: () => setHelpOpen((o) => !o),
        description: "Toggle keyboard shortcuts",
        category: "General",
      },
      {
        key: "Escape",
        handler: () => setHelpOpen(false),
        description: "Close overlay / blur input",
        category: "General",
      },
      {
        key: "o",
        chord: "g",
        handler: () => router.push("/dashboard"),
        description: "Go to Overview",
        category: "Navigation",
      },
      {
        key: "s",
        chord: "g",
        handler: () => router.push("/dashboard/subscription"),
        description: "Go to Subscription",
        category: "Navigation",
      },
      {
        key: "b",
        chord: "g",
        handler: () => router.push("/dashboard/billing"),
        description: "Go to Billing",
        category: "Navigation",
      },
      {
        key: "a",
        chord: "g",
        handler: () => router.push("/dashboard/affiliate"),
        description: "Go to Affiliate",
        category: "Navigation",
      },
    ],
    [router],
  );

  // Flatten all shortcuts
  const allShortcuts = useMemo(() => {
    const pageShortcuts = Array.from(registry.values()).flat();
    return [...globalShortcuts, ...pageShortcuts];
  }, [globalShortcuts, registry]);

  const { clearChord } = useKeyboardShortcuts(allShortcuts);

  // Clear chord state on route change
  useEffect(() => {
    if (pathname !== prevPathRef.current) {
      clearChord();
      prevPathRef.current = pathname;
    }
  }, [pathname, clearChord]);

  const contextValue = useMemo<KeyboardShortcutsContextValue>(
    () => ({
      isHelpOpen,
      setHelpOpen,
      shortcuts: allShortcuts,
      registerShortcuts,
      unregisterShortcuts,
    }),
    [isHelpOpen, allShortcuts, registerShortcuts, unregisterShortcuts],
  );

  return (
    <KeyboardShortcutsContext.Provider value={contextValue}>
      {children}
    </KeyboardShortcutsContext.Provider>
  );
}
