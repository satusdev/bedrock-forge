import { Test } from "@nestjs/testing";
import { BillingSettingsService } from "./billing-settings.service";
import { SettingsRepository } from "../settings.repository";
import { BadRequestException } from "@nestjs/common";

const makeRepo = () => ({
  findAll: jest.fn(),
  upsert: jest.fn(),
});

describe("BillingSettingsService", () => {
  let service: BillingSettingsService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    repo = makeRepo();
    const module = await Test.createTestingModule({
      providers: [
        BillingSettingsService,
        { provide: SettingsRepository, useValue: repo },
      ],
    }).compile();
    service = module.get(BillingSettingsService);
  });

  it("getBillingSettings returns defaults if unset", async () => {
    repo.findAll.mockResolvedValue([]);
    const res = await service.getBillingSettings();
    expect(res).toEqual({ currency_code: "USD", currency_locale: "en-US" });
  });

  it("setBillingSettings rejects invalid currency", async () => {
    await expect(
      service.setBillingSettings({ currency_code: "US", currency_locale: "en-US" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("setBillingSettings saves correct values", async () => {
    await service.setBillingSettings({ currency_code: "EUR", currency_locale: "de-DE" });
    expect(repo.upsert).toHaveBeenCalledWith("billing.currency_code", "EUR");
    expect(repo.upsert).toHaveBeenCalledWith("billing.currency_locale", "de-DE");
  });
});
