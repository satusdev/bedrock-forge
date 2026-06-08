import { SecurityScanRunnerService } from "./security-scan-runner.service";
import * as serverChecks from "../server-checks";
import * as envChecks from "../environment-checks";
import * as scoring from "../scoring";

jest.mock("../server-checks");
jest.mock("../environment-checks");
jest.mock("../scoring");
jest.mock("@bedrock-forge/remote-executor", () => ({
  createRemoteExecutor: jest.fn().mockReturnValue({}),
}));

describe("SecurityScanRunnerService", () => {
  let service: SecurityScanRunnerService;
  let prismaMock: any;
  let sshKeyMock: any;
  let notificationsQueueMock: any;

  beforeEach(() => {
    prismaMock = {
      server: {
        findUnique: jest.fn(),
      },
      environment: {
        findUnique: jest.fn(),
      },
      jobExecution: {
        update: jest.fn().mockResolvedValue({}),
      },
      securityScan: {
        update: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      securityScanSchedule: {
        findUnique: jest.fn(),
      },
    };
    sshKeyMock = {
      resolvePrivateKey: jest.fn(),
    };
    notificationsQueueMock = {
      add: jest.fn(),
    };
    service = new SecurityScanRunnerService(
      prismaMock,
      sshKeyMock,
      notificationsQueueMock,
    );
    jest.clearAllMocks();
  });

  describe("processServerScan", () => {
    it("processes server scans successfully and updates statuses", async () => {
      const job = {
        data: {
          serverId: 1,
          scanTypes: ["SSH_AUDIT"],
          jobExecutionId: 100,
          scanIds: [200],
        },
        updateProgress: jest.fn(),
      } as any;

      const server = {
        id: 1,
        ip_address: "1.2.3.4",
        ssh_port: 22,
        ssh_user: "root",
      };

      prismaMock.server.findUnique.mockResolvedValue(server);
      sshKeyMock.resolvePrivateKey.mockResolvedValue("fake-key");

      const findings = [{ id: "finding-1", severity: "low", message: "test" }];
      (serverChecks.runSshAudit as jest.Mock).mockResolvedValue(findings);
      (scoring.calculateScore as jest.Mock).mockReturnValue(95);
      (scoring.buildSummary as jest.Mock).mockReturnValue({
        info: 0,
        low: 1,
        medium: 0,
        high: 0,
        critical: 0,
      });

      await service.processServerScan(job);

      expect(prismaMock.jobExecution.update).toHaveBeenCalledWith({
        where: { id: BigInt(100) },
        data: { status: "active", started_at: expect.any(Date) },
      });

      expect(prismaMock.securityScan.update).toHaveBeenCalledWith({
        where: { id: BigInt(200) },
        data: { status: "running", started_at: expect.any(Date) },
      });

      expect(serverChecks.runSshAudit).toHaveBeenCalled();

      expect(prismaMock.securityScan.update).toHaveBeenLastCalledWith({
        where: { id: BigInt(200) },
        data: {
          status: "completed",
          score: 95,
          summary: { info: 0, low: 1, medium: 0, high: 0, critical: 0 },
          findings: findings as any,
          completed_at: expect.any(Date),
        },
      });

      expect(job.updateProgress).toHaveBeenCalledWith(100);
      expect(prismaMock.jobExecution.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: BigInt(100) },
          data: expect.objectContaining({
            status: "completed",
            completed_at: expect.any(Date),
            progress: 100,
          }),
        }),
      );
    });

    it("marks job execution failed if server is not found", async () => {
      const job = {
        data: {
          serverId: 1,
          scanTypes: ["SSH_AUDIT"],
          jobExecutionId: 100,
          scanIds: [200],
        },
      } as any;

      prismaMock.server.findUnique.mockResolvedValue(null);

      await expect(service.processServerScan(job)).rejects.toThrow(
        "Server 1 not found",
      );

      expect(prismaMock.jobExecution.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: BigInt(100) },
          data: expect.objectContaining({
            status: "failed",
            last_error: "Server 1 not found",
            completed_at: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe("processEnvironmentScan", () => {
    it("processes environment scans successfully and updates statuses", async () => {
      const job = {
        data: {
          environmentId: 2,
          scanTypes: ["WP_AUDIT"],
          jobExecutionId: 101,
          scanIds: [201],
        },
        updateProgress: jest.fn(),
      } as any;

      const env = {
        id: 2,
        root_path: "/var/www",
        server: {
          id: 1,
          ip_address: "1.2.3.4",
          ssh_port: 22,
          ssh_user: "root",
        },
      };

      prismaMock.environment.findUnique.mockResolvedValue(env);
      sshKeyMock.resolvePrivateKey.mockResolvedValue("fake-key");

      const findings = [
        { id: "finding-2", severity: "medium", message: "test wp" },
      ];
      (envChecks.runWpAudit as jest.Mock).mockResolvedValue(findings);
      (scoring.calculateScore as jest.Mock).mockReturnValue(80);
      (scoring.buildSummary as jest.Mock).mockReturnValue({
        info: 0,
        low: 0,
        medium: 1,
        high: 0,
        critical: 0,
      });

      await service.processEnvironmentScan(job);

      expect(prismaMock.jobExecution.update).toHaveBeenCalledWith({
        where: { id: BigInt(101) },
        data: { status: "active", started_at: expect.any(Date) },
      });

      expect(prismaMock.securityScan.update).toHaveBeenCalledWith({
        where: { id: BigInt(201) },
        data: { status: "running", started_at: expect.any(Date) },
      });

      expect(envChecks.runWpAudit).toHaveBeenCalled();

      expect(prismaMock.securityScan.update).toHaveBeenLastCalledWith({
        where: { id: BigInt(201) },
        data: {
          status: "completed",
          score: 80,
          summary: { info: 0, low: 0, medium: 1, high: 0, critical: 0 },
          findings: findings as any,
          completed_at: expect.any(Date),
        },
      });
    });
  });
});
