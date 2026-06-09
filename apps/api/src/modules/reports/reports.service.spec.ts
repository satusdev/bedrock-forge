import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ReportsService } from "./reports.service";
import { ReportsRepository } from "./reports.repository";
import { SettingsService } from "../settings/settings.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { QUEUES, JOB_TYPES } from "@bedrock-forge/shared";

const makeRepo = () => ({
  findHistory: jest.fn(),
  findAvailableChannels: jest.fn(),
  findChannelById: jest.fn(),
  updateChannelEvents: jest.fn(),
});

const makeSettings = () => ({
  get: jest.fn(),
  set: jest.fn(),
});

const makeEncryption = () => ({
  encrypt: jest.fn(),
  decrypt: jest.fn(),
});

const makeQueue = () => ({
  add: jest.fn(),
  getRepeatableJobs: jest.fn(),
  removeRepeatableByKey: jest.fn(),
});

describe("ReportsService", () => {
  let service: ReportsService;
  let repo: ReturnType<typeof makeRepo>;
  let settings: ReturnType<typeof makeSettings>;
  let queue: ReturnType<typeof makeQueue>;

  beforeEach(async () => {
    repo = makeRepo();
    settings = makeSettings();
    queue = makeQueue();

    const module = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: ReportsRepository, useValue: repo },
        { provide: SettingsService, useValue: settings },
        { provide: EncryptionService, useValue: makeEncryption() },
        { provide: getQueueToken(QUEUES.REPORTS), useValue: queue },
      ],
    }).compile();

    service = module.get(ReportsService);
  });

  describe("onModuleInit", () => {
    it("should restore repeatability scan config if enabled", async () => {
      settings.get.mockResolvedValue({
        value: JSON.stringify({
          enabled: true,
          day_of_week: 1,
          hour: 9,
          minute: 0,
          period: "last_7d",
        }),
      });

      await service.onModuleInit();
      expect(queue.add).toHaveBeenCalledWith(
        JOB_TYPES.REPORT_GENERATE,
        { period: "last_7d" },
        expect.objectContaining({ jobId: "weekly-report" }),
      );
    });

    it("should not restore repeatability if disabled", async () => {
      settings.get.mockResolvedValue({
        value: JSON.stringify({
          enabled: false,
        }),
      });

      await service.onModuleInit();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe("getConfig", () => {
    it("returns parsed config or null", async () => {
      settings.get.mockResolvedValue({
        value: JSON.stringify({ enabled: true, hour: 12 }),
      });
      const config = await service.getConfig();
      expect(config).toEqual({ enabled: true, hour: 12 });
    });
  });

  describe("updateConfig", () => {
    it("persists config and schedules new repeatable job", async () => {
      queue.getRepeatableJobs.mockResolvedValue([]);
      const dto = {
        enabled: true,
        day_of_week: 2,
        hour: 10,
        minute: 30,
        period: "last_30d" as const,
      };

      const res = await service.updateConfig(dto);
      expect(settings.set).toHaveBeenCalledWith(
        "report_weekly_schedule",
        JSON.stringify({
          enabled: true,
          day_of_week: 2,
          hour: 10,
          minute: 30,
          period: "last_30d",
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        JOB_TYPES.REPORT_GENERATE,
        { period: "last_30d" },
        expect.objectContaining({
          repeat: { pattern: "30 10 * * 2" },
        }),
      );
      expect(res).toBeDefined();
    });
  });

  describe("generateNow", () => {
    it("enqueues ad-hoc generation job", async () => {
      queue.add.mockResolvedValue({ id: "adhoc-1" });
      const res = await service.generateNow({ period: "last_7d", channelIds: [1, 2] });
      expect(queue.add).toHaveBeenCalledWith(
        JOB_TYPES.REPORT_GENERATE,
        { period: "last_7d", channelIds: [1, 2] },
        expect.any(Object),
      );
      expect(res).toEqual({ jobId: "adhoc-1" });
    });
  });

  describe("toggleChannelSubscription", () => {
    it("toggles and updates weekly report subscription", async () => {
      repo.findChannelById.mockResolvedValue({
        id: BigInt(3),
        events: ["other-event"],
      });
      repo.updateChannelEvents.mockResolvedValue({
        id: 3,
        name: "Test",
        subscribed: true,
      });

      const res = await service.toggleChannelSubscription(3, true);
      expect(repo.updateChannelEvents).toHaveBeenCalledWith(3, ["other-event", "report.weekly"]);
      expect(res.subscribed).toBe(true);
    });
  });
});
