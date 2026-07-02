"use client";

/**
 * Shows a user their own submitted testimonial: rating, quote, moderation
 * status, and any reply from the team (previously invisible to customers).
 * Pure presentational: the parent fetches /api/testimonials/mine.
 */

export type MyReview = {
  id: string;
  rating: number;
  body: string;
  status: "pending" | "approved" | "rejected" | "hidden";
  authorName: string | null;
  authorRole: string | null;
  photoUrl: string | null;
  teamResponse: string | null;
  respondedAt: string | null;
  createdAt: string;
};

function statusBadge(status: MyReview["status"]): { label: string; className: string } {
  switch (status) {
    case "approved":
      return { label: "Live on our site", className: "bg-emerald-100 text-emerald-800" };
    case "pending":
      return { label: "Waiting for review", className: "bg-amber-100 text-amber-800" };
    default:
      return { label: "Not published", className: "bg-slate-100 text-slate-600" };
  }
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export default function MyReviewCard({ review }: { review: MyReview }) {
  const badge = statusBadge(review.status);
  const submitted = formatDate(review.createdAt);
  const replied = formatDate(review.respondedAt);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Your review</h2>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1" aria-label={`${review.rating} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className="text-2xl leading-none"
            style={{ color: n <= review.rating ? "#f59e0b" : "#d1d5db" }}
            aria-hidden="true"
          >
            {"★"}
          </span>
        ))}
      </div>

      <blockquote className="mt-3 whitespace-pre-line text-sm text-slate-700">
        {review.body}
      </blockquote>
      <p className="mt-2 text-xs text-slate-400">
        {review.authorName ?? "You"}
        {review.authorRole ? `, ${review.authorRole}` : ""}
        {submitted ? ` - submitted ${submitted}` : ""}
      </p>

      {review.status === "approved" ? (
        <p className="mt-3 text-xs text-slate-500">
          Thank you! You can see it on our{" "}
          <a href="/#testimonials" className="font-semibold text-orange-600 hover:underline">
            homepage
          </a>
          .
        </p>
      ) : null}
      {review.status === "rejected" || review.status === "hidden" ? (
        <p className="mt-3 text-xs text-slate-500">
          Thanks for the feedback; this one is not on the site.
        </p>
      ) : null}

      {review.teamResponse ? (
        <div className="mt-4 rounded-xl border-l-4 border-orange-300 bg-orange-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            Reply from the Influencer Butler team
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{review.teamResponse}</p>
          {replied ? <p className="mt-1 text-xs text-slate-400">{replied}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
