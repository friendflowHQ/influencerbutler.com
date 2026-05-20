import Link from "next/link";
import { loadManifest } from "@/lib/tutorials";

export const metadata = {
  title: "Ask a question — Influencer Butler",
  description: "Post a question for the Influencer Butler community.",
};

export const dynamic = "force-dynamic";

export default async function AskPage() {
  const manifest = await loadManifest();

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            ← Influencer Butler
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/help" className="text-slate-700 hover:text-slate-900">
              Help
            </Link>
            <Link href="/help/community" className="text-slate-700 hover:text-slate-900">
              Community Q&amp;A
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Ask the community</h1>
        <p className="mt-2 text-slate-600">
          Sign in is required to post. Your question lands in the moderation
          queue and goes live once approved.
        </p>

        <form
          id="ask-form"
          className="mt-8 space-y-5 rounded-lg border border-slate-200 bg-white p-6"
        >
          <label className="block text-sm font-medium text-slate-700">
            Workspace this is about
            <select
              name="workspaceId"
              required
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              defaultValue=""
            >
              <option value="" disabled>
                Pick a workspace...
              </option>
              {manifest.tutorials.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Title
            <input
              type="text"
              name="title"
              required
              maxLength={200}
              placeholder="A short, specific question..."
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Details
            <textarea
              name="body"
              rows={6}
              maxLength={8000}
              placeholder="What have you tried? What did you expect to see?"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
            >
              Post question
            </button>
            <span id="ask-status" className="text-sm text-slate-600" aria-live="polite" />
          </div>
        </form>

        <p className="mt-6 text-sm text-slate-500">
          You can also post questions directly from the desktop app: open{" "}
          <strong>Help &amp; Tutorials</strong> → <strong>Ask a question</strong>.
        </p>
      </section>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              const form = document.getElementById('ask-form');
              const status = document.getElementById('ask-status');
              if (!form || !status) return;
              form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const fd = new FormData(form);
                const payload = {
                  workspaceId: String(fd.get('workspaceId') || ''),
                  title: String(fd.get('title') || ''),
                  body: String(fd.get('body') || ''),
                };
                if (!payload.workspaceId || !payload.title.trim()) {
                  status.textContent = 'Pick a workspace and add a title.';
                  status.style.color = '#b00020';
                  return;
                }
                status.textContent = 'Posting...';
                status.style.color = '';
                try {
                  const res = await fetch('/api/help/questions', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  const json = await res.json().catch(() => ({}));
                  if (!res.ok || !json.ok) {
                    if (res.status === 401) {
                      status.textContent = 'Sign in required to post.';
                    } else {
                      status.textContent = json.error || 'Could not post.';
                    }
                    status.style.color = '#b00020';
                    return;
                  }
                  status.textContent = 'Posted — waiting for review.';
                  status.style.color = '#1a7f37';
                  form.reset();
                } catch (err) {
                  status.textContent = (err && err.message) || 'Network error.';
                  status.style.color = '#b00020';
                }
              });
            })();
          `,
        }}
      />
    </main>
  );
}
