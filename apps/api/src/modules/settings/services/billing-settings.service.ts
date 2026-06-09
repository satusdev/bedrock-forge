import { BadRequestException, Injectable } from "@nestjs/common";
import { SettingsRepository } from "../settings.repository";

@Injectable()
export class BillingSettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  async getBillingSettings() {
    const settings = await this.repo.findAll();
    const all = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    return {
      currency_code: all["billing.currency_code"] ?? "USD",
      currency_locale: all["billing.currency_locale"] ?? "en-US",
    };
  }

  async setBillingSettings(input: {
    currency_code: string;
    currency_locale: string;
  }) {
    const currency = input.currency_code.trim().toUpperCase();
    const locale = input.currency_locale.trim();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException(
        "Currency code must be a 3-letter ISO code",
      );
    }
    try {
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
      }).format(1);
    } catch {
      throw new BadRequestException("Invalid currency or locale");
    }
    await Promise.all([
      this.repo.upsert("billing.currency_code", currency),
      this.repo.upsert("billing.currency_locale", locale),
    ]);
    return { currency_code: currency, currency_locale: locale };
  }
}
