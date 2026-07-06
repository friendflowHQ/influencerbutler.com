import { addSection, criteriaList, el, infoTip } from "../../ui/components";
import { t } from "../../i18n";
import type { ApprovedVerdict } from "./criteria";

export function renderSeal(verdict: ApprovedVerdict): void {
  const section = addSection(t().butlerApproved);

  const seal = el("div", verdict.approved ? "seal pass" : "seal fail");
  seal.textContent = verdict.approved ? t().approvedYes : t().approvedNo;
  // Hover the seal to see exactly why, without scanning the checklist.
  seal.append(infoTip(reasonFor(verdict)));
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

// A one-line explanation of the verdict for the seal's tooltip: the checks
// that blocked approval (and any that could not be read), or a pass note.
function reasonFor(verdict: ApprovedVerdict): string {
  if (verdict.approved) return t().approvedReasonPass;
  const failed = verdict.criteria.filter((c) => c.state === "fail").map((c) => c.label);
  const unknown = verdict.criteria.filter((c) => c.state === "unknown").map((c) => c.label);
  const parts: string[] = [];
  if (failed.length) parts.push(t().approvedReasonFail(failed.join("; ")));
  if (unknown.length) parts.push(t().approvedReasonUnknown(unknown.join("; ")));
  return parts.join(" ");
}
