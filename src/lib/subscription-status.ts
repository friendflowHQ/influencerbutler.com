/**
 * Shared presentation for a subscription's status pill, used by the dashboard
 * overview and the subscription page (previously duplicated verbatim in both).
 *
 * `note` is optional supporting copy. For the free-trial state it answers the
 * single most common support question ("will I be charged?"): our trials never
 * auto-charge, so we say so plainly next to the badge.
 */
export type StatusBadge = {
  label: string;
  className: string;
  /** Optional one-line clarification shown beneath / alongside the badge. */
  note?: string;
};

export function getStatusBadge(status: string): StatusBadge {
  switch (status) {
    case "active":
      return { label: "Active", className: "bg-emerald-100 text-emerald-800" };
    case "on_trial":
      return {
        label: "Free Trial",
        className: "bg-blue-100 text-blue-800",
        note: "Your free trial does not auto-charge. You are billed only if you choose to upgrade to Pro, and your free-forever butlers keep working either way.",
      };
    case "cancelled":
      return { label: "Cancelled", className: "bg-slate-200 text-slate-700" };
    case "past_due":
      return { label: "Past Due", className: "bg-red-100 text-red-800" };
    case "paused":
      return { label: "Paused", className: "bg-yellow-100 text-yellow-800" };
    default:
      return { label: status, className: "bg-slate-100 text-slate-700" };
  }
}
