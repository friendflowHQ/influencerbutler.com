import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";

const SITE = "https://www.influencerbutler.com";
const API_BASE = "https://links.influencerbutler.com";

export const metadata: Metadata = {
  title: "Developer API: Create Butler Deeplinks From Your Platform",
  description:
    "Integrate with Influencer Butler's deeplink service. Creators issue your platform an API key and secret so you can create their branded Butler links through a simple HTTPS API.",
  alternates: { canonical: `${SITE}/developers` },
  openGraph: {
    title: "Influencer Butler Developer API",
    description:
      "Create branded Butler deeplinks on a creator's behalf with an API key and secret. Links land in the creator's own dashboard.",
    url: `${SITE}/developers`,
    type: "website",
    siteName: "Influencer Butler",
  },
  twitter: {
    card: "summary_large_image",
    title: "Influencer Butler Developer API",
    description:
      "Create branded Butler deeplinks on a creator's behalf. Simple key + secret over HTTPS.",
  },
};

const STEPS = [
  {
    n: "01",
    title: "A creator issues you a key",
    body: "In the Influencer Butler desktop app, the creator opens API Integrations, then DeepLink Routing, then Developer API access. They create a key named after your platform and receive an API key plus a secret.",
  },
  {
    n: "02",
    title: "They send you the key and secret",
    body: "The secret is shown only once, so the creator copies it and passes both values to you through your normal secure onboarding. Store the secret encrypted, like a password.",
  },
  {
    n: "03",
    title: "You create their links",
    body: "Call the API with those two headers. Every link you create lands in that creator's namespace, so it shows up in their own Link Butler dashboard and analytics automatically.",
  },
];

const SCOPES = [
  { name: "links:write", grants: "Create links and publish routing." },
  { name: "links:read", grants: "List links, read stats, export click events." },
  { name: "links:heal", grants: "Repoint a link so posted copies self-heal." },
  { name: "pixels:write", grants: "Manage account-wide retargeting pixels." },
];

const ENDPOINTS = [
  { method: "POST", path: "/api/links", scope: "links:write", purpose: "Create or look up a branded short link (idempotent per destination)." },
  { method: "GET", path: "/api/links/list", scope: "links:read", purpose: "List the creator's links, keyset paginated." },
  { method: "GET", path: "/api/links/stats", scope: "links:read", purpose: "Owner-scoped click analytics." },
  { method: "GET", path: "/api/links/events", scope: "links:read", purpose: "Per-click event export." },
  { method: "POST", path: "/api/links/repoint", scope: "links:heal", purpose: "Point an existing link at a new destination." },
  { method: "POST", path: "/api/links/pixels", scope: "pixels:write", purpose: "Save the creator's retargeting pixels." },
];

const ERRORS = [
  { status: "400", code: "invalid_url", meaning: "The destination was not a valid http(s) URL." },
  { status: "401", code: "invalid_api_key", meaning: "Missing, unknown, or revoked key, or a wrong secret." },
  { status: "403", code: "insufficient_scope", meaning: "The key lacks the scope this endpoint needs." },
  { status: "404", code: "not_found", meaning: "No such link in this creator's namespace." },
  { status: "409", code: "target_in_use", meaning: "Another of the creator's links already points there." },
  { status: "429", code: "rate_limited", meaning: "Slow down and honor the Retry-After header." },
];

const CURL_EXAMPLE = `curl -sS ${API_BASE}/api/links \\
  -H "X-Api-Key: $IB_API_KEY" \\
  -H "X-Api-Secret: $IB_API_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://www.amazon.com/dp/B0EXAMPLE",
    "label": "Spring skincare pick"
  }'`;

const JSON_RESPONSE = `{
  "ok": true,
  "slug": "aB3xQ7z",
  "shortUrl": "${API_BASE}/l/aB3xQ7z"
}`;

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-900 p-5 text-sm leading-relaxed text-slate-100">
      <code>{children}</code>
    </pre>
  );
}

export default function DevelopersPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-orange-50 to-white">
        <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">
            Developer API
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Create Butler deeplinks from your own platform
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-600">
            If your platform shares customers with Influencer Butler, those
            creators can let you build their branded Butler links through our API.
            You authenticate with a key and secret they issue you, and every link
            you create shows up in their own dashboard.
          </p>
          <div className="mt-8">
            <a
              href="#quickstart"
              className="inline-flex rounded-[14px] bg-orange-500 px-6 py-3 text-base font-semibold text-white shadow-[0_2px_8px_rgba(249,115,22,0.3)] transition hover:bg-orange-600"
            >
              Read the quickstart
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-orange-600">
          How access works
        </p>
        <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          The creator is always in control
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-bold text-orange-500">{s.n}</div>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-900">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quickstart */}
      <section id="quickstart" className="scroll-mt-20 border-y border-slate-200 bg-[#fafafa] py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">
            Quickstart
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Authenticate and create a link
          </h2>
          <p className="mt-6 text-lg text-slate-600">
            Send both credentials as headers over HTTPS on every request. The base
            URL is <code className="rounded bg-slate-200 px-1.5 py-0.5 text-sm">{API_BASE}</code>.
          </p>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-700">Required headers</p>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              <li><code className="rounded bg-slate-100 px-1.5 py-0.5">X-Api-Key: ibk_live_...</code></li>
              <li><code className="rounded bg-slate-100 px-1.5 py-0.5">X-Api-Secret: ibsk_live_...</code></li>
            </ul>
          </div>

          <h3 className="mt-10 text-lg font-bold text-slate-900">Create a link</h3>
          <div className="mt-4">
            <CodeBlock>{CURL_EXAMPLE}</CodeBlock>
          </div>
          <p className="mt-4 text-slate-600">You get back the branded short link:</p>
          <div className="mt-4">
            <CodeBlock>{JSON_RESPONSE}</CodeBlock>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Creating the same destination again returns the existing link with
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5">reused: true</code>
            instead of a duplicate.
          </p>
        </div>
      </section>

      {/* Scopes */}
      <section className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Scopes</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Each key carries scopes
        </h2>
        <p className="mt-6 text-lg text-slate-600">
          A call that needs a scope the key does not have returns
          <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-sm">403 insufficient_scope</code>.
        </p>
        <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Scope</th>
                <th className="px-5 py-3 font-semibold">Grants</th>
              </tr>
            </thead>
            <tbody>
              {SCOPES.map((s) => (
                <tr key={s.name} className="border-t border-slate-200">
                  <td className="px-5 py-3 font-mono text-orange-600">{s.name}</td>
                  <td className="px-5 py-3 text-slate-600">{s.grants}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Endpoints */}
      <section className="border-y border-slate-200 bg-[#fafafa] py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Endpoints</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            What you can call
          </h2>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Method</th>
                  <th className="px-5 py-3 font-semibold">Path</th>
                  <th className="px-5 py-3 font-semibold">Scope</th>
                  <th className="px-5 py-3 font-semibold">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map((e) => (
                  <tr key={e.path} className="border-t border-slate-200">
                    <td className="px-5 py-3 font-mono font-semibold text-slate-700">{e.method}</td>
                    <td className="px-5 py-3 font-mono text-slate-700">{e.path}</td>
                    <td className="px-5 py-3 font-mono text-orange-600">{e.scope}</td>
                    <td className="px-5 py-3 text-slate-600">{e.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Errors */}
      <section className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Errors</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Predictable error codes
        </h2>
        <p className="mt-6 text-lg text-slate-600">
          Every response is JSON. Success is
          <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-sm">{"{ ok: true, ... }"}</code>;
          failure is
          <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-sm">{"{ ok: false, error }"}</code>.
          Retry 429 and 5xx with backoff.
        </p>
        <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Code</th>
                <th className="px-5 py-3 font-semibold">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {ERRORS.map((e) => (
                <tr key={e.code} className="border-t border-slate-200">
                  <td className="px-5 py-3 font-mono font-semibold text-slate-700">{e.status}</td>
                  <td className="px-5 py-3 font-mono text-orange-600">{e.code}</td>
                  <td className="px-5 py-3 text-slate-600">{e.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-200 bg-gradient-to-b from-white to-orange-50">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Want to integrate your platform?
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Ask the creators you work with to issue you a Developer API key from
            their Influencer Butler app, then start creating their links.
          </p>
          <div className="mt-8">
            <Link
              href="/contact"
              className="inline-flex rounded-[14px] bg-orange-500 px-8 py-3.5 text-base font-semibold text-white shadow-[0_2px_8px_rgba(249,115,22,0.3)] transition hover:bg-orange-600"
            >
              Talk to us about an integration
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
