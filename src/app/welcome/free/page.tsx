import WelcomeTierContent from "../WelcomeTierContent";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Welcome to Influencer Butler Free",
};

export default function WelcomeFreePage() {
  return <WelcomeTierContent tier="free" />;
}
