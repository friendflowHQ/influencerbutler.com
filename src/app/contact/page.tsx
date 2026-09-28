import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";
import ContactForm from "./ContactForm";

export const metadata = {
  title: "Contact Us - Influencer Butler",
  description:
    "Send the Influencer Butler team a question, bug report, or feature request. We read every message and reply by email.",
};

export const dynamic = "force-dynamic";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <SiteHeader />

      <section className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Contact us</h1>
        <p className="mt-2 text-slate-600">
          Have a question, hit a snag, or want to suggest something? Send us a
          message and the team will get back to you by email.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Already using the app? You can also reach us from{" "}
          <strong>Feedback</strong> in the left menu, which attaches diagnostic
          details automatically.
        </p>

        <ContactForm />
      </section>

      <SiteFooter />
    </div>
  );
}
