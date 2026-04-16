import WelcomeTierContent from "../WelcomeTierContent";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Welcome to Pro Monthly — Influencer Butler",
};

export default function WelcomeMonthlyPage() {
  return <WelcomeTierContent tier="monthly" />;
}
