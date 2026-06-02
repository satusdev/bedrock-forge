/// <reference types="jest" />

import { PluginScanProcessor } from './plugin-scan.processor';

function makeProcessor(prisma: any) {
	return new PluginScanProcessor(prisma, {} as any, {} as any) as any;
}

describe('PluginScanProcessor custom plugin reconciliation', () => {
	it('upserts detected monorepo catalog plugins', async () => {
		const prisma = {
			customPlugin: {
				findMany: jest.fn().mockResolvedValue([
					{
						id: BigInt(7),
						slug: 'wp-secure-guard',
						repo_url: 'git@github.com:satusdev/wp-secure-guard.git',
					},
				]),
			},
			environmentCustomPlugin: {
				upsert: jest.fn(),
				deleteMany: jest.fn(),
			},
		};
		const processor = makeProcessor(prisma);

		await processor.reconcileCustomPluginCatalog(BigInt(3), [
			{
				slug: 'wp-secure-guard',
				version: '1.0.0',
				managed_by_monorepo: true,
				monorepo_repo_url: 'https://github.com/satusdev/wp-secure-guard.git',
				is_mu_plugin: false,
			},
		]);

		expect(prisma.environmentCustomPlugin.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					environment_id_custom_plugin_id: {
						environment_id: BigInt(3),
						custom_plugin_id: BigInt(7),
					},
				},
				update: { installed_version: '1.0.0' },
			}),
		);
		expect(prisma.environmentCustomPlugin.deleteMany).not.toHaveBeenCalled();
	});

	it('deletes stale custom plugin rows when scan no longer detects them', async () => {
		const prisma = {
			customPlugin: {
				findMany: jest.fn().mockResolvedValue([
					{
						id: BigInt(7),
						slug: 'wp-secure-guard',
						repo_url: 'git@github.com:satusdev/wp-secure-guard.git',
					},
				]),
			},
			environmentCustomPlugin: {
				upsert: jest.fn(),
				deleteMany: jest.fn(),
			},
		};
		const processor = makeProcessor(prisma);

		await processor.reconcileCustomPluginCatalog(BigInt(3), []);

		expect(prisma.environmentCustomPlugin.upsert).not.toHaveBeenCalled();
		expect(prisma.environmentCustomPlugin.deleteMany).toHaveBeenCalledWith({
			where: {
				environment_id: BigInt(3),
				custom_plugin_id: { in: [BigInt(7)] },
			},
		});
	});
});
