import { NotFoundException } from '@nestjs/common';
import { PluginPoliciesService } from './plugin-policies.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('PluginPoliciesService', () => {
	let prisma: MockPrisma;
	let service: PluginPoliciesService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new PluginPoliciesService(prisma as unknown as any);
	});

	it('returns existing global policy', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				owner_id: 1,
				name: 'Default Policy',
				is_default: true,
				allowed_plugins: '[]',
				required_plugins: '["wordfence"]',
				blocked_plugins: '[]',
				pinned_versions: '{}',
				notes: null,
			},
		]);

		const result = await service.getGlobalPolicy();
		expect(result.name).toBe('Default Policy');
		expect(result.required_plugins).toEqual(['wordfence']);
	});

	it('updates global policy', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
					id: 1,
					owner_id: 1,
					name: 'Default Policy',
					is_default: true,
					allowed_plugins: '[]',
					required_plugins: '[]',
					blocked_plugins: '[]',
					pinned_versions: '{}',
					notes: null,
				},
			])
			.mockResolvedValueOnce([
				{
					id: 1,
					owner_id: 1,
					name: 'New Name',
					is_default: true,
					allowed_plugins: '["a"]',
					required_plugins: '["b"]',
					blocked_plugins: '["c"]',
					pinned_versions: '{"b":"1.0.0"}',
					notes: 'hello',
				},
			]);

		const result = await service.updateGlobalPolicy({
			name: 'New Name',
			allowed_plugins: ['a'],
			required_plugins: ['b'],
			blocked_plugins: ['c'],
			pinned_versions: { b: '1.0.0' },
			notes: 'hello',
		});

		expect(result.name).toBe('New Name');
		expect(result.allowed_plugins).toEqual(['a']);
	});

	it('returns effective project policy', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 10 }])
			.mockResolvedValueOnce([
				{
					id: 1,
					owner_id: 1,
					name: 'Default Policy',
					is_default: true,
					allowed_plugins: '["a"]',
					required_plugins: '["core"]',
					blocked_plugins: '[]',
					pinned_versions: '{}',
					notes: null,
				},
			])
			.mockResolvedValueOnce([
				{
					id: 2,
					project_id: 10,
					inherit_default: true,
					allowed_plugins: '["b"]',
					required_plugins: '["seo"]',
					blocked_plugins: '["bad"]',
					pinned_versions: '{}',
					notes: 'project',
				},
			]);

		const result = await service.getEffectivePolicy(10);
		expect(result.source).toBe('project_override');
		expect(result.required_plugins).toEqual(['core', 'seo']);
	});

	it('returns plugin drift payload', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{ id: 3, project_id: 10, environment: 'production' },
			])
			.mockResolvedValueOnce([
				{
					id: 1,
					owner_id: 1,
					name: 'Default Policy',
					is_default: true,
					allowed_plugins: '[]',
					required_plugins: '["wordfence"]',
					blocked_plugins: '["bad-plugin"]',
					pinned_versions: '{"seo":"1.2.0"}',
					notes: null,
				},
			])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([
				{
					plugins:
						'[{"name":"seo","version":"1.0.0"},{"name":"bad-plugin","version":"1.0.0"}]',
					last_scanned_at: new Date('2026-02-18T00:00:00.000Z'),
				},
			]);

		const result = await service.getPluginDrift(3);
		expect(result.project_id).toBe(10);
		expect(result.missing_required).toEqual(['wordfence']);
		expect(result.blocked_installed).toEqual(['bad-plugin']);
		expect(result.version_mismatches).toEqual({ seo: '1.0.0' });
	});

	it('throws for missing project', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(service.getProjectPolicy(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('returns default project policy when project exists but policy row is missing', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 10 }])
			.mockResolvedValueOnce([]);

		const result = await service.getProjectPolicy(10);

		expect(result.project_id).toBe(10);
		expect(result.inherit_default).toBe(true);
		expect(result.allowed_plugins).toEqual([]);
		expect(result.required_plugins).toEqual([]);
		expect(result.blocked_plugins).toEqual([]);
		expect(result.pinned_versions).toEqual({});
	});
});
