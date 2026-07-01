import { FACEBOOK_GROUP_URL } from "@/lib/social";

// Brand-blue Facebook glyph linking to our community group. Reused across the
// site footers (blog chrome, pricing, affiliates). SVG path matches the one in
// BlogShareButtons so the icon stays consistent everywhere.
export default function FacebookGroupIconLink({ className }: { className?: string }) {
  return (
    <a
      href={FACEBOOK_GROUP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Join our Facebook group"
      className={`inline-flex text-[#1877F2] transition hover:text-[#0d6ad8] ${className ?? ""}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
        <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.128 22 16.991 22 12z" />
      </svg>
    </a>
  );
}
