import React, { useEffect, useMemo, useState } from "react";
import { Save, Info } from "lucide-react";
import { useBillingSettings } from "@/hooks/useBillingSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useUpdateBillingSettingsMutation } from "../hooks";

const COMMON_CURRENCIES = [
  { code: "USD", label: "USD - US Dollar", locale: "en-US" },
  { code: "EUR", label: "EUR - Euro", locale: "en-US" },
  { code: "LYD", label: "LYD - Libyan Dinar", locale: "ar-LY" },
  { code: "GBP", label: "GBP - British Pound", locale: "en-GB" },
  { code: "TRY", label: "TRY - Turkish Lira", locale: "tr-TR" },
  { code: "AED", label: "AED - UAE Dirham", locale: "ar-AE" },
  { code: "SAR", label: "SAR - Saudi Riyal", locale: "ar-SA" },
] as const;

export function BillingCurrencyForm() {
  const { settings, isLoading } = useBillingSettings();
  const [currencyCode, setCurrencyCode] = useState(settings.currency_code);
  const [currencyLocale, setCurrencyLocale] = useState(
    settings.currency_locale,
  );

  useEffect(() => {
    setCurrencyCode(settings.currency_code);
    setCurrencyLocale(settings.currency_locale);
  }, [settings.currency_code, settings.currency_locale]);

  const preview = useMemo(() => {
    try {
      return new Intl.NumberFormat(currencyLocale || "en-US", {
        style: "currency",
        currency: currencyCode || "USD",
      }).format(1234.56);
    } catch {
      return "Invalid currency or locale";
    }
  }, [currencyCode, currencyLocale]);

  const saveMutation = useUpdateBillingSettingsMutation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing Currency</CardTitle>
        <CardDescription>
          Controls how package prices and invoices are displayed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="billing-currency">Currency</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-muted-foreground hover:text-foreground">
                    <Info className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Select the base currency code used for packaging prices and invoicing.
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              value={currencyCode}
              onValueChange={(value) => {
                setCurrencyCode(value);
                const preset = COMMON_CURRENCIES.find((c) => c.code === value);
                if (preset) setCurrencyLocale(preset.locale);
              }}
              disabled={isLoading}
            >
              <SelectTrigger id="billing-currency">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_CURRENCIES.map((currency) => (
                  <SelectItem key={currency.code} value={currency.code}>
                    {currency.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="billing-locale">Locale</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-muted-foreground hover:text-foreground">
                    <Info className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  The IETF BCP 47 language tag (e.g., en-US, ar-LY) used for localizing currency formatting.
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              id="billing-locale"
              value={currencyLocale}
              onChange={(e) => setCurrencyLocale(e.target.value)}
              placeholder="en-US"
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Preview</span>
          <span className="ml-3 font-semibold">{preview}</span>
        </div>

        <Button
          onClick={() =>
            saveMutation.mutate({
              currency_code: currencyCode.trim().toUpperCase(),
              currency_locale: currencyLocale.trim(),
            })
          }
          disabled={saveMutation.isPending || isLoading}
        >
          <Save className="h-4 w-4 mr-1.5" />
          {saveMutation.isPending ? "Saving..." : "Save Currency"}
        </Button>
      </CardContent>
    </Card>
  );
}
