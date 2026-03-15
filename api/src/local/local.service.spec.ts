import { NotFoundException } from '@nestjs/common';
import { LocalService } from './local.service';

describe('LocalService', () => {
	let service: LocalService;

	beforeEach(() => {
		service = new LocalService();
	});

	it('throws not found for missing project directory', async () => {
		await expect(
			service.runComposerUpdate('__missing_project__'),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('returns local availability and base directory payloads', async () => {
		const availability = await service.checkLocalAvailability();
		const baseDirectory = await service.getBaseDirectory();

		expect(typeof availability.base_directory).toBe('string');
		expect(baseDirectory).toHaveProperty('base_directory');
		expect(baseDirectory).toHaveProperty('exists');
	});

	it('ensures base directory and discovers projects', async () => {
		const ensured = await service.ensureBaseDirectory();
		const discovered = await service.discoverLocalProjects();

		expect(['exists', 'created']).toContain(ensured.status);
		expect(discovered).toHaveProperty('discovered');
		expect(discovered).toHaveProperty('tracked_count');
	});

	it('imports discovered project from ensured base dir', async () => {
		await service.ensureBaseDirectory();
		const projectName = '__import_test_project__';
		const baseDir = await service.getBaseDirectory();
		const { mkdir, rm } = await import('fs/promises');
		const { join } = await import('path');
		const projectPath = join(baseDir.base_directory, projectName);

		await mkdir(projectPath, { recursive: true });
		const result = await service.importDiscoveredProject(projectName);
		expect(result.status).toBe('imported');

		await rm(projectPath, { recursive: true, force: true });
	});
});
