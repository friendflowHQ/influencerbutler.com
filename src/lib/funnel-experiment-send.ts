// Funnels v2: the one seam between a funnel's send function and the A/B
// engine. Each sendXEmail resolves its control copy (override, tailored or
// bare code default) and then, only when the Funnels v2 send path supplied a
// content key, asks email-experiments whether a running test covers that
// step. The returned tracking fields go straight into sendMarketingEmail so
// email_sends.step_key / experiment_id / variant get written.
//
// email-experiments imports system-funnels, which imports every funnel copy
// module, so a static import from a copy module would be a cycle. The engine
// is loaded lazily on first use instead.
//
// Never throws: any failure returns the control copy with only the step key.

import type { SendTracking } from "@/lib/email-send";

export type ExperimentSendResult = {
  subject: string;
  body: string;
  tracking: SendTracking;
};

export async function withFunnelExperiment(args: {
  funnel: string;
  contentKey: string;
  email: string;
  control: { subject: string; body: string };
  vars?: Record<string, unknown>;
}): Promise<ExperimentSendResult> {
  const base: ExperimentSendResult = {
    subject: args.control.subject,
    body: args.control.body,
    tracking: { stepKey: args.contentKey },
  };
  try {
    const { chooseExperimentCopy } = await import("@/lib/email-experiments");
    const chosen = await chooseExperimentCopy(null, {
      funnel: args.funnel,
      contentKey: args.contentKey,
      email: args.email,
      defaultCopy: args.control,
      vars: args.vars,
    });
    return {
      subject: chosen.subject,
      body: chosen.body,
      tracking: {
        stepKey: args.contentKey,
        ...(chosen.experimentId ? { experimentId: chosen.experimentId } : {}),
        ...(chosen.variant ? { variant: chosen.variant } : {}),
      },
    };
  } catch (err) {
    console.error("funnel-experiment-send: experiment lookup failed", err);
    return base;
  }
}
