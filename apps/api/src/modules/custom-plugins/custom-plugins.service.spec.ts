/// <reference types="jest" />

import { CustomPluginsService } from "./custom-plugins.service";

function makeRepo() {
  return {
    findAll: jest.fn(),
    findById: jest.fn(),
    findInventoryData: jest.fn(),
    countInstallations: jest.fn(),
    listInstallations: jest.fn(),
    updateLatestVersionForInstallations: jest.fn(),
    createJobExecution: jest.fn(),
  };
}

function makeGithub() {
  return { getLatestTag: jest.fn() };
}

function makeQueue() {
  return { add: jest.fn() };
}

describe("CustomPluginsService", () => {
  let repo: ReturnType<typeof makeRepo>;
  let github: ReturnType<typeof makeGithub>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: CustomPluginsService;

  beforeEach(() => {
    repo = makeRepo();
    github = makeGithub();
    queue = makeQueue();
    const jobOrchestrator = {
      enqueue: jest
        .fn()
        .mockImplementation(async ({ queue: q, payload, beforeQueueAdd }) => {
          const jobExecutionId = payload.environmentId === 1 ? 101 : 102;
          const jobData = beforeQueueAdd
            ? await beforeQueueAdd(jobExecutionId)
            : { ...payload, jobExecutionId };
          const job = await q.add("CUSTOM_PLUGIN_MANAGE", jobData);
          return { jobExecutionId, bullJobId: job.id };
        }),
    };
    svc = new CustomPluginsService(
      repo as any,
      github as any,
      jobOrchestrator as any,
      queue as any,
    );
  });

  it("builds inventory from installed rows and latest scan detections", async () => {
    repo.findById.mockResolvedValue({
      id: BigInt(7),
      name: "WP Secure Guard",
      slug: "wp-secure-guard",
      repo_url: "git@github.com:satusdev/wp-secure-guard.git",
    });
    repo.findInventoryData.mockResolvedValue([
      {
        id: BigInt(1),
        type: "production",
        url: "https://one.test",
        project: {
          id: BigInt(10),
          name: "One",
          client: { id: BigInt(100), name: "Client" },
        },
        server: {
          id: BigInt(20),
          name: "Server",
          ip_address: "203.0.113.10",
        },
        custom_plugins: [
          {
            installed_version: "1.0.0",
            latest_version: "1.1.0",
            version_checked_at: new Date("2026-05-01T00:00:00Z"),
          },
        ],
        plugin_scans: [
          {
            scanned_at: new Date("2026-05-02T00:00:00Z"),
            plugins: {
              plugins: [{ slug: "wp-secure-guard", version: "1.0.0" }],
            },
          },
        ],
      },
      {
        id: BigInt(2),
        type: "staging",
        url: "https://two.test",
        project: {
          id: BigInt(11),
          name: "Two",
          client: { id: BigInt(101), name: "Client" },
        },
        server: {
          id: BigInt(21),
          name: "Server",
          ip_address: "203.0.113.11",
        },
        custom_plugins: [],
        plugin_scans: [
          {
            scanned_at: new Date("2026-05-02T00:00:00Z"),
            plugins: {
              plugins: [{ slug: "wp-secure-guard", version: "1.0.0" }],
            },
          },
        ],
      },
    ]);

    const result = await svc.getInventory(7);

    expect(result.summary).toMatchObject({
      environments: 2,
      installed: 1,
      detected: 2,
      outdated: 1,
      not_scanned: 0,
    });
    expect(result.inventory[0]).toMatchObject({
      status: "installed",
      outdated: true,
      installed_version: "1.0.0",
      latest_version: "1.1.0",
    });
    expect(result.inventory[1]).toMatchObject({
      status: "detected",
      scanned_version: "1.0.0",
    });
  });

  it("queues update jobs for every installed environment", async () => {
    repo.findById.mockResolvedValue({
      id: BigInt(7),
      slug: "wp-secure-guard",
      repo_url: "git@github.com:satusdev/wp-secure-guard.git",
      repo_path: ".",
      type: "plugin",
    });
    repo.listInstallations.mockResolvedValue([
      { environment_id: BigInt(1) },
      { environment_id: BigInt(2) },
    ]);
    queue.add.mockResolvedValueOnce({ id: "job-1" }).mockResolvedValueOnce({
      id: "job-2",
    });

    const result = await svc.updateInstalled(7);

    expect(result.count).toBe(2);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add.mock.calls[0][1]).toMatchObject({
      environmentId: 1,
      action: "update",
      customPluginId: 7,
      slug: "wp-secure-guard",
    });
  });
});
