import { addSection, criteriaList, el } from "../../ui/components";
import type { ApprovedVerdict } from "./criteria";

export function renderSeal(verdict: ApprovedVerdict): void {
  const section = addSection("Butler Approved");

  const seal = el("div", verdict.approved ? "seal pass" : "seal fail");
  seal.textContent = verdict.approved
    ? "Butler Approved: worth making content for"
    : "Not Butler Approved yet";
  section.append(seal);

  section.append(
    criteriaList(
      verdict.criteria.map((c) => ({ label: c.label, state: c.state })),
    ),
  );

  const note = el("p", "note");
  note.textContent = "Criteria read from this page. Tune thresholds in the extension popup.";
  section.append(note);
}
