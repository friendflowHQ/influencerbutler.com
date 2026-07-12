/**
 * Canonical perjury certification wording for the affiliate tax form.
 *
 * The exact string the affiliate agrees to is stored verbatim in the immutable
 * affiliate_tax_form_events audit table, so the UI and the server MUST pull the
 * copy from here (never inline it) to keep the shown text and the recorded text
 * identical. If a signed W-9 / W-8 is ever challenged, this is the language we
 * can prove the affiliate certified.
 */

export type TaxFormType = "W-9" | "W-8BEN" | "W-8BEN-E";

// US persons (Form W-9). Mirrors the Part II perjury certification.
export const CERTIFICATION_TEXT_W9 =
  "Under penalties of perjury, I certify that: (1) the taxpayer identification number shown on this form is my correct TIN (or I am waiting for one to be issued); (2) I am not subject to backup withholding; (3) I am a US person; and that the information above is true, correct, and complete, and that I am the person (or authorized to sign for the entity) named above.";

// Foreign persons (Form W-8BEN / W-8BEN-E). Mirrors the Part III certification.
export const CERTIFICATION_TEXT_W8 =
  "Under penalties of perjury, I certify that: I am the beneficial owner (or authorized to sign for the beneficial owner) of the income this form relates to; I am not a US person; and that the information above is true, correct, and complete.";

export function certificationTextFor(formType: TaxFormType): string {
  return formType === "W-9" ? CERTIFICATION_TEXT_W9 : CERTIFICATION_TEXT_W8;
}
