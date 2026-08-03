/**
 * /dashboard/ai-concierge - the instant Butler AI voice/text concierge. Auth is
 * enforced by the dashboard layout and by every /api/ai-concierge/* route.
 */
import AiConcierge from "./AiConcierge";

export const metadata = { title: "Butler AI concierge" };

export default function Page() {
  return <AiConcierge />;
}
