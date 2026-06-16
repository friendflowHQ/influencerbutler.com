"use client";

import { useEffect, useState } from "react";
import LicenseKeyDisplay, { type LicenseKey } from "@/components/dashboard/LicenseKeyDisplay";

type Props = {
  variant: "card" | "panel";
};

/**
 * Self-loading wrapper around LicenseKeyDisplay for contexts that don't already
 * fetch subscription details (e.g. the post-checkout /welcome pages). Reads the
 * key from /api/me/subscription-details, a service-role read (bypasses RLS)
 * with an email -> Lemon Squeezy fallback, so the key shows even when the
 * subscriptions row is RLS-hidden or freshly written by the webhook.
 */
export default function LicenseKeyLoader({ variant }: Props) {
  const [loading, setLoading] = useState(true);
  const [licenseKey, setLicenseKey] = useState<LicenseKey | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/me/subscription-details");
        if (!response.ok) {
          setLoading(false);
          return;
        }
        const payload = (await response.json()) as { licenseKey?: LicenseKey | null };
        setLicenseKey(payload.licenseKey ?? null);
      } catch (err) {
        console.error("Failed to load license key", err);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return <LicenseKeyDisplay variant={variant} licenseKey={licenseKey} loading={loading} />;
}
