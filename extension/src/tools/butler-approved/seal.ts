import { addSection, criteriaList, el } from "../../ui/components";
import { t } from "../../i18n";
import type { ApprovedVerdict } from "./criteria";

export function renderSeal(verdict: ApprovedVerdict): void {
  const section = addSection(t().butlerApproved);

  const seal = el("div", verdict.approved ? "seal pass" : "seal fail");
  seal.textContent = verdict.approved ? t().approvedYes : t().approvedNo;
  section.append(seal);

  section.append(
    criteriaList(
      verdict.criteria.map((c) => ({ label: c.label, state: c.state })),
    ),
  );

  const note = el("p", "note");
  note.textContent = t().approvedCriteriaNote;
  section.append(note);
}
