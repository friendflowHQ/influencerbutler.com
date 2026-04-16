import WelcomeTierContent from "../WelcomeTierContent";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Welcome to Pro Annual — Influencer Butler",
};

export default function WelcomeAnnualPage() {
  return <WelcomeTierContent tier="annual" />;
}
