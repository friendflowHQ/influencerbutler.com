import { el } from "../ui/components";
import { showModal } from "../ui/modal";
import { patchSettings } from "../storage/store";

// The "?" cheat sheet for the search-results shortcuts, with a one-click way to
// turn single-key shortcuts off (they can also be turned off in the popup).

type HelpCopy = {
  title: string;
  rows: Array<[string, string]>;
  toggleNote: string;
  turnOff: string;
  close: string;
};

const EN: HelpCopy = {
  title: "Keyboard shortcuts",
  rows: [
    ["j", "Next product"],
    ["k", "Previous product"],
    ["s", "Shortlist the highlighted product"],
    ["?", "Show this list"],
    ["Alt+Shift+B", "Show or hide badges (change it at chrome://extensions/shortcuts)"],
  ],
  toggleNote: "Single keys only work when you are not typing in a box.",
  turnOff: "Turn off single-key shortcuts",
  close: "Close",
};
const ES: HelpCopy = {
  title: "Atajos de teclado",
  rows: [
    ["j", "Producto siguiente"],
    ["k", "Producto anterior"],
    ["s", "Preseleccionar el producto resaltado"],
    ["?", "Mostrar esta lista"],
    ["Alt+Shift+B", "Mostrar u ocultar insignias (cámbialo en chrome://extensions/shortcuts)"],
  ],
  toggleNote: "Las teclas solas solo funcionan cuando no estás escribiendo en un campo.",
  turnOff: "Desactivar los atajos de una tecla",
  close: "Cerrar",
};
const FR: HelpCopy = {
  title: "Raccourcis clavier",
  rows: [
    ["j", "Produit suivant"],
    ["k", "Produit précédent"],
    ["s", "Présélectionner le produit mis en évidence"],
    ["?", "Afficher cette liste"],
    ["Alt+Shift+B", "Afficher ou masquer les badges (modifiable sur chrome://extensions/shortcuts)"],
  ],
  toggleNote: "Les touches seules ne fonctionnent que si vous ne saisissez pas de texte.",
  turnOff: "Désactiver les raccourcis à une touche",
  close: "Fermer",
};

export function showShortcutsHelp(locale: string): void {
  const c = locale.startsWith("es") ? ES : locale.startsWith("fr") ? FR : EN;
  const table = el("table", "shortcuts-table");
  for (const [key, label] of c.rows) {
    const tr = el("tr");
    const th = el("th");
    th.append(el("kbd", "shortcuts-key", key));
    tr.append(th, el("td", undefined, label));
    table.append(tr);
  }
  showModal({
    title: c.title,
    body: [table],
    note: c.toggleNote,
    closeLabel: c.close,
    actions: [
      {
        label: c.turnOff,
        variant: "secondary",
        onClick: () => void patchSettings({ singleKeyShortcuts: false }),
      },
      { label: c.close, variant: "primary", onClick: () => undefined },
    ],
  });
}
