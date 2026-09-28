import ObfuscatedEmail from "@/components/ObfuscatedEmail";

/**
 * Friendly "the terms are negotiable" note shown under the affiliate terms
 * checkbox on both apply forms (public /affiliates/apply and the inline
 * dashboard form). Keeps the copy + email in one place. The address is
 * bot-resistant via ObfuscatedEmail.
 */
export default function NegotiateTermsNote() {
  return (
    <p className="rounded-lg border border-orange-100 bg-orange-50/60 px-4 py-3 text-sm text-slate-600">
      Not sure about the terms? We&apos;re all ears: email us at{" "}
      <ObfuscatedEmail
        user="affiliates"
        domain="influencerbutler.com"
        subject="Affiliate terms"
        className="font-medium text-[#c2410c] underline underline-offset-2 hover:text-[#9a3412]"
      />{" "}
      to talk it through and we&apos;ll see what we can do.
    </p>
  );
}
