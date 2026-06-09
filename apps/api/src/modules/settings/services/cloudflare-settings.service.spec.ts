import { Test } from "@nestjs/testing";
import { CloudflareSettingsService } from "./cloudflare-settings.service";
import { SettingsRepository } from "../settings.repository";
import { EncryptionService } from "../../../common/encryption/encryption.service";
import { BadRequestException } from "@nestjs/common";

const makeRepo = () => ({
  findByKey: jest.fn(),
  upsert: jest.fn(),
  delete: jest.fn(),
});

const makeEnc = () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace("enc:", "")),
});

describe("CloudflareSettingsService", () => {
  let service: CloudflareSettingsService;
  let repo: ReturnType<typeof makeRepo>;
  let enc: ReturnType<typeof makeEnc>;

  beforeEach(async () => {
    repo = makeRepo();
    enc = makeEnc();
    const module = await Test.createTestingModule({
      providers: [
        CloudflareSettingsService,
        { provide: SettingsRepository, useValue: repo },
        { provide: EncryptionService, useValue: enc },
      ],
    }).compile();
    service = module.get(CloudflareSettingsService);
  });

  it("getCloudflareConfig returns configured false if missing token", async () => {
    repo.findByKey.mockResolvedValue(null);
    const res = await service.getCloudflareConfig();
    expect(res.configured).toBe(false);
  });

  it("setCloudflareConfig encrypts and stores the api_token", async () => {
    await service.setCloudflareConfig({
      api_token: "test-token",
      zone_id: "test-zone",
      zone_name: "test.com",
    });
    expect(enc.encrypt).toHaveBeenCalledWith("test-token");
    expect(repo.upsert).toHaveBeenCalledWith("cloudflare_api_token", "enc:test-token");
    expect(repo.upsert).toHaveBeenCalledWith("cloudflare_zone_id", "test-zone");
  });

  it("deleteCloudflareConfig removes all keys", async () => {
    repo.delete.mockResolvedValue(undefined);
    await service.deleteCloudflareConfig();
    expect(repo.delete).toHaveBeenCalledWith("cloudflare_api_token");
    expect(repo.delete).toHaveBeenCalledWith("cloudflare_zone_id");
  });
});
