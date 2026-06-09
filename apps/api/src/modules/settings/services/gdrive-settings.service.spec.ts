import { Test } from "@nestjs/testing";
import { GdriveSettingsService } from "./gdrive-settings.service";
import { SettingsRepository } from "../settings.repository";
import { EncryptionService } from "../../../common/encryption/encryption.service";
import { ConfigService } from "@nestjs/config";
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

const makeConfig = () => ({
  get: jest.fn((key: string) => {
    if (key === "RCLONE_REMOTE_NAME") return "gdrive";
    return null;
  }),
});

describe("GdriveSettingsService", () => {
  let service: GdriveSettingsService;
  let repo: ReturnType<typeof makeRepo>;
  let enc: ReturnType<typeof makeEnc>;

  beforeEach(async () => {
    repo = makeRepo();
    enc = makeEnc();
    const module = await Test.createTestingModule({
      providers: [
        GdriveSettingsService,
        { provide: SettingsRepository, useValue: repo },
        { provide: EncryptionService, useValue: enc },
        { provide: ConfigService, useValue: makeConfig() },
      ],
    }).compile();
    service = module.get(GdriveSettingsService);
  });

  it("getGdriveConfig returns configured false if missing", async () => {
    repo.findByKey.mockResolvedValue(null);
    const res = await service.getGdriveConfig();
    expect(res.configured).toBe(false);
  });

  it("setGdrive rejects invalid json", async () => {
    await expect(service.setGdrive("not-json")).rejects.toThrow(BadRequestException);
  });

  it("setGdrive accepts correct json and encrypts it", async () => {
    const token = JSON.stringify({
      access_token: "abc",
      refresh_token: "xyz",
    });
    await service.setGdrive(token);
    expect(enc.encrypt).toHaveBeenCalled();
    expect(repo.upsert).toHaveBeenCalledWith("rclone_gdrive_config", expect.any(String));
  });
});
