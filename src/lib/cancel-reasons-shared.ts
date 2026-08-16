// Client-safe half of the cancellation questionnaire: the reason labels,
// buying-intent options, and their normalizers. Pure data + pure functions, no
// server imports, so client components (CancelFunnel, CancelSurveyForm) can
// import it without dragging the service-role Supabase client (and its
// next/headers dependency) into the browser bundle. Server-side readers keep
// importing from @/lib/cancel-reasons, which re-exports everything here.

export type Reason =
  | "too_expensive"
  | "not_using"
  | "missing_features"
  | "found_alternative"
  | "technical_issues"
  | "just_testing"
  | "other";

export type ReasonOption = { value: Reason; label: string };

export const REASONS: ReasonOption[] = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_using", label: "Not using it enough" },
  { value: "missing_features", label: "Missing features I need" },
  { value: "found_alternative", label: "Found an alternative" },
  { value: "technical_issues", label: "Technical issues" },
  { value: "just_testing", label: "Just testing it out" },
  { value: "other", label: "Other" },
];

export function reasonLabel(value: string | null): string {
  if (!value) return "Unspecified";
  const found = REASONS.find((r) => r.value === value);
  return found ? found.label : value;
}

export type WouldReturn = "yes" | "maybe" | "no";

export type WouldReturnOption = { value: WouldReturn; label: string };

export const WOULD_RETURN_OPTIONS: WouldReturnOption[] = [
  { value: "yes", label: "Yes, likely" },
  { value: "maybe", label: "Maybe someday" },
  { value: "no", label: "No" },
];

const REASON_VALUES = new Set<string>(REASONS.map((r) => r.value));
const WOULD_RETURN_VALUES = new Set<string>(WOULD_RETURN_OPTIONS.map((o) => o.value));

/** Clamp an untrusted reason to a known value, defaulting to "other". */
export function normalizeReason(value: unknown): Reason {
  const v = typeof value === "string" ? value : "";
  return (REASON_VALUES.has(v) ? v : "other") as Reason;
}

/** Clamp an untrusted would-return answer, or null if not one of the options. */
export function normalizeWouldReturn(value: unknown): WouldReturn | null {
  const v = typeof value === "string" ? value : "";
  return WOULD_RETURN_VALUES.has(v) ? (v as WouldReturn) : null;
}
