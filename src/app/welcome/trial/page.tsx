import WelcomeTierContent from "../WelcomeTierContent";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your trial is live — Influencer Butler",
};

export default function WelcomeTrialPage() {
  return <WelcomeTierContent tier="trial" />;
}
