import { api } from "@/lib/api-client";

export const billingApi = {
  saveBillingSettings: (data: {
    currency_code: string;
    currency_locale: string;
  }) => api.put<void>("/settings/billing", data),
};
