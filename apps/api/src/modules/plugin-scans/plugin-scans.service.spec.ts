/// <reference types="jest" />

import { PluginScansService } from "./plugin-scans.service";

function makeRepo() {
  return {
    findAllEnvironmentIds: jest.fn(),
  };
}

function makeQueue() {
  return { add: jest.fn() };
}

describe("PluginScansService", () => {
  it("queues a scan for every environment during bulk scan", async () => {
    const repo = makeRepo();
    const queue = makeQueue();

    const jobOrchestrator = {
      enqueue: jest
        .fn()
        .mockImplementation(
          async ({ queue: q, jobType, payload, beforeQueueAdd }) => {
            const jobExecutionId = payload.environmentId === 1 ? 11 : 12;
            const jobData = beforeQueueAdd
              ? await beforeQueueAdd(jobExecutionId)
              : { ...payload, jobExecutionId };
            const job = await q.add(jobType, jobData, {
              jobId: "scan-" + payload.environmentId,
            });
            return { jobExecutionId, bullJobId: job.id };
          },
        ),
    };

    const svc = new PluginScansService(
      repo as any,
      jobOrchestrator as any,
      queue as any,
      makeQueue() as any,
      {} as any,
    );

    repo.findAllEnvironmentIds.mockResolvedValue([
      { id: BigInt(1) },
      { id: BigInt(2) },
    ]);

    queue.add.mockResolvedValueOnce({ id: "scan-1" }).mockResolvedValueOnce({
      id: "scan-2",
    });

    const result = await svc.enqueueBulkScan();

    expect(result.count).toBe(2);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add.mock.calls[0][1]).toMatchObject({
      environmentId: 1,
      jobExecutionId: 11,
    });
    expect(queue.add.mock.calls[1][1]).toMatchObject({
      environmentId: 2,
      jobExecutionId: 12,
    });
  });

  it("defaults plugin management jobs to skip safety backup", async () => {
    const repo = makeRepo();
    const queue = makeQueue();

    const jobOrchestrator = {
      enqueue: jest
        .fn()
        .mockImplementation(
          async ({ queue: q, jobType, payload, beforeQueueAdd }) => {
            const jobExecutionId = 21;
            const jobData = beforeQueueAdd
              ? await beforeQueueAdd(jobExecutionId)
              : { ...payload, jobExecutionId };
            const job = await q.add(jobType, jobData, { jobId: "manage-1" });
            return { jobExecutionId, bullJobId: job.id };
          },
        ),
    };

    const svc = new PluginScansService(
      repo as any,
      jobOrchestrator as any,
      queue as any,
      makeQueue() as any,
      {} as any,
    );

    queue.add.mockResolvedValue({ id: "manage-1" });

    await svc.enqueuePluginManage(3, "delete", "elementor");

    expect(queue.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        environmentId: 3,
        action: "delete",
        slug: "elementor",
        skipSafetyBackup: true,
      }),
      expect.any(Object),
    );
  });
});
