import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface BillingSettings {
  currency_code: string;
  currency_locale: string;
}

const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  currency_code: "USD",
  currency_locale: "en-US",
};

export function useBillingSettings() {
  const query = useQuery<BillingSettings>({
    queryKey: ["settings", "billing"],
    queryFn: () => api.get("/settings/public/billing"),
    staleTime: 5 * 60_000,
  });

  const settings = query.data ?? DEFAULT_BILLING_SETTINGS;
  const formatter = useMemo(() => {
    try {
      return new Intl.NumberFormat(settings.currency_locale, {
        style: "currency",
        currency: settings.currency_code,
      });
    } catch {
      return new Intl.NumberFormat(DEFAULT_BILLING_SETTINGS.currency_locale, {
        style: "currency",
        currency: DEFAULT_BILLING_SETTINGS.currency_code,
      });
    }
  }, [settings.currency_code, settings.currency_locale]);

  return {
    ...query,
    settings,
    formatMoney: (amount: string | number) => {
      const value = Number.parseFloat(String(amount));
      return formatter.format(Number.isFinite(value) ? value : 0);
    },
  };
}
