import { getLocale } from "../i18n";

// One glanceable connection state for the popup header, derived from data the
// popup already loads. The detailed cards (Account, Desktop app) stay as they
// are; the pill only summarizes and points at the one that needs attention.

export type ConnectionState = "problem" | "syncing" | "connected" | "partial" | "disconnected";

export type ConnectionInput = {
  signedIn: boolean;
  appPaired: boolean;
  queueDepth: number;
  lastSyncError: string | null;
};

export type ConnectionSummary = {
  state: ConnectionState;
  // Id of the popup card that fixes it.
  target: "account" | "app-bridge";
  queueDepth: number;
};

export function deriveConnection(input: ConnectionInput): ConnectionSummary {
  const { signedIn, appPaired, queueDepth, lastSyncError } = input;
  if (signedIn && queueDepth > 0 && lastSyncError) return { state: "problem", target: "account", queueDepth };
  if (signedIn && queueDepth > 0) return { state: "syncing", target: "account", queueDepth };
  if (signedIn && appPaired) return { state: "connected", target: "app-bridge", queueDepth };
  if (signedIn) return { state: "partial", target: "app-bridge", queueDepth };
  return { state: "disconnected", target: "account", queueDepth };
}

type PillCopy = {
  problem: (n: number) => string;
  syncing: (n: number) => string;
  connected: string;
  partial: string;
  disconnected: string;
  hint: Record<ConnectionState, string>;
};

const EN: PillCopy = {
  problem: (n) => `Sync problem (${n})`,
  syncing: (n) => `Syncing ${n}`,
  connected: "Connected",
  partial: "App not paired",
  disconnected: "Not connected",
  hint: {
    problem: "Findings are waiting to sync. Open Account for details.",
    syncing: "Findings are syncing to your dashboard.",
    connected: "Signed in and paired with the desktop app.",
    partial: "Signed in, but the desktop app is not paired. Open Desktop app to pair.",
    disconnected: "Add your license key in Account to connect.",
  },
};
const ES: PillCopy = {
  problem: (n) => `Problema de sincronizacion (${n})`,
  syncing: (n) => `Sincronizando ${n}`,
  connected: "Conectado",
  partial: "App sin vincular",
  disconnected: "No conectado",
  hint: {
    problem: "Hay hallazgos esperando sincronizar. Abre Cuenta para ver detalles.",
    syncing: "Los hallazgos se estan sincronizando con tu panel.",
    connected: "Sesion iniciada y vinculada con la app de escritorio.",
    partial: "Sesion iniciada, pero la app de escritorio no esta vinculada. Abre App de escritorio.",
    disconnected: "Agrega tu clave de licencia en Cuenta para conectar.",
  },
};
const FR: PillCopy = {
  problem: (n) => `Probleme de synchronisation (${n})`,
  syncing: (n) => `Synchronisation ${n}`,
  connected: "Connecte",
  partial: "Appli non associee",
  disconnected: "Non connecte",
  hint: {
    problem: "Des decouvertes attendent d'etre synchronisees. Ouvrez Compte pour les details.",
    syncing: "Les decouvertes sont en cours de synchronisation avec votre tableau de bord.",
    connected: "Connecte et associe a l'application de bureau.",
    partial: "Connecte, mais l'application de bureau n'est pas associee. Ouvrez Application de bureau.",
    disconnected: "Ajoutez votre cle de licence dans Compte pour vous connecter.",
  },
};

export function pillCopy(summary: ConnectionSummary): { label: string; hint: string } {
  const locale = String(getLocale());
  const c = locale.startsWith("es") ? ES : locale.startsWith("fr") ? FR : EN;
  const label =
    summary.state === "problem"
      ? c.problem(summary.queueDepth)
      : summary.state === "syncing"
        ? c.syncing(summary.queueDepth)
        : c[summary.state];
  return { label, hint: c.hint[summary.state] };
}
