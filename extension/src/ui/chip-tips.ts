// Accessible chip explanations. Chips carry their explanation in a native
// `title`, which keyboard and touch users never see. This upgrades every
// non-interactive `.tile-chip[title]` inside a badge: the chip becomes
// focusable, the text moves to an aria-label, and a popover shows on hover,
// focus, tap or Enter/Space (Escape closes). Chips that are already buttons or
// links keep their own behavior. Works for chips added later (MutationObserver).

const TIP_ATTR = "data-ib-tip";

export function enableChipTips(wrap: HTMLElement): void {
  let pop: HTMLElement | null = null;
  let owner: HTMLElement | null = null;

  const hide = () => {
    pop?.remove();
    pop = null;
    owner?.removeAttribute("aria-describedby");
    owner = null;
  };

  const show = (chip: HTMLElement) => {
    const text = chip.getAttribute(TIP_ATTR);
    if (!text) return;
    if (owner === chip && pop) return;
    hide();
    pop = document.createElement("div");
    pop.className = "chip-pop";
    pop.id = `ib-chip-pop-${Math.random().toString(36).slice(2, 8)}`;
    pop.setAttribute("role", "tooltip");
    pop.textContent = text;
    wrap.append(pop);
    owner = chip;
    chip.setAttribute("aria-describedby", pop.id);
    const wrapBox = wrap.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    const maxLeft = Math.max(0, wrapBox.width - pop.offsetWidth);
    pop.style.left = `${Math.min(Math.max(0, chipBox.left - wrapBox.left), maxLeft)}px`;
    pop.style.top = `${chipBox.bottom - wrapBox.top + 4}px`;
  };

  const upgrade = (chip: HTMLElement) => {
    const tip = chip.getAttribute("title");
    if (!tip || chip.hasAttribute(TIP_ATTR)) return;
    if (chip.matches("button, a")) return;
    chip.setAttribute(TIP_ATTR, tip);
    chip.removeAttribute("title");
    chip.tabIndex = 0;
    chip.setAttribute("role", "button");
    chip.setAttribute("aria-label", `${chip.textContent ?? ""}. ${tip}`.trim());
  };

  const scan = () => {
    for (const chip of Array.from(wrap.querySelectorAll<HTMLElement>(".tile-chip[title]"))) upgrade(chip);
  };

  const chipFrom = (target: EventTarget | null): HTMLElement | null =>
    target instanceof HTMLElement ? target.closest<HTMLElement>(`.tile-chip[${TIP_ATTR}]`) : null;

  wrap.addEventListener("mouseover", (e) => {
    const chip = chipFrom(e.target);
    if (chip) show(chip);
  });
  wrap.addEventListener("mouseout", (e) => {
    if (chipFrom(e.target) && !(e.relatedTarget instanceof Node && owner?.contains(e.relatedTarget))) hide();
  });
  wrap.addEventListener("focusin", (e) => {
    const chip = chipFrom(e.target);
    if (chip) show(chip);
  });
  wrap.addEventListener("focusout", (e) => {
    if (chipFrom(e.target)) hide();
  });
  wrap.addEventListener("click", (e) => {
    const chip = chipFrom(e.target);
    if (!chip) return;
    if (owner === chip && pop) hide();
    else show(chip);
  });
  wrap.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hide();
      return;
    }
    const chip = chipFrom(e.target);
    if (chip && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      if (owner === chip && pop) hide();
      else show(chip);
    }
  });

  scan();
  new MutationObserver(scan).observe(wrap, { childList: true, subtree: true, attributes: true, attributeFilter: ["title"] });
}
