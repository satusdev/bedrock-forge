/// <reference types="jest" />

import { PluginScansService } from './plugin-scans.service';

function makeRepo() {
	return {
		findAllEnvironmentIds: jest.fn(),
		createJobExecution: jest.fn(),
	};
}

function makeQueue() {
	return { add: jest.fn() };
}

describe('PluginScansService', () => {
	it('queues a scan for every environment during bulk scan', async () => {
		const repo = makeRepo();
		const queue = makeQueue();
		const svc = new PluginScansService(
			repo as any,
			queue as any,
			makeQueue() as any,
			{} as any,
		);

		repo.findAllEnvironmentIds.mockResolvedValue([
			{ id: BigInt(1) },
			{ id: BigInt(2) },
		]);
		repo.createJobExecution
			.mockResolvedValueOnce({ id: BigInt(11) })
			.mockResolvedValueOnce({ id: BigInt(12) });
		queue.add.mockResolvedValueOnce({ id: 'scan-1' }).mockResolvedValueOnce({
			id: 'scan-2',
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

	it('defaults plugin management jobs to skip safety backup', async () => {
		const repo = makeRepo();
		const queue = makeQueue();
		const svc = new PluginScansService(
			repo as any,
			queue as any,
			makeQueue() as any,
			{} as any,
		);

		repo.createJobExecution.mockResolvedValue({ id: BigInt(21) });
		queue.add.mockResolvedValue({ id: 'manage-1' });

		await svc.enqueuePluginManage(3, 'delete', 'elementor');

		expect(queue.add).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				environmentId: 3,
				action: 'delete',
				slug: 'elementor',
				skipSafetyBackup: true,
			}),
			expect.any(Object),
		);
	});
});
