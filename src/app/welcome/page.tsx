import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WelcomePollClient from "./WelcomePollClient";

export const dynamic = "force-dynamic";

type SubscriptionRow = {
  status: string | null;
  ls_variant_id: string | null;
};

export default async function WelcomeDispatcherPage() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login?next=/welcome");
  }

  const { data: subs } = await supabase
    .from("subscriptions")
    .select("status,ls_variant_id")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const sub = (subs && subs.length > 0 ? (subs[0] as SubscriptionRow) : null);
  const tierRoute = resolveTierRoute(sub);

  if (tierRoute) {
    redirect(tierRoute);
  }

  // Webhook hasn't landed yet (or the user has no subscription at all). Render
  // the polling client so we redirect as soon as the row appears.
  return <WelcomePollClient />;
}

export function resolveTierRoute(
  sub: SubscriptionRow | null,
): "/welcome/trial" | "/welcome/monthly" | "/welcome/annual" | null {
  if (!sub) return null;
  const monthlyVariant = process.env.LEMONSQUEEZY_VARIANT_MONTHLY ?? null;
  const annualVariant = process.env.LEMONSQUEEZY_VARIANT_ANNUAL ?? null;
  const variant = sub.ls_variant_id ? String(sub.ls_variant_id) : null;

  if (sub.status === "on_trial") return "/welcome/trial";
  if (sub.status === "active") {
    if (variant && annualVariant && variant === annualVariant) return "/welcome/annual";
    if (variant && monthlyVariant && variant === monthlyVariant) return "/welcome/monthly";
    // Unknown-but-active variant: fall through to polling (rare).
    return null;
  }
  return null;
}
