import { Controller, Get, Param, Post } from '@nestjs/common';
import { LocalService } from './local.service';

@Controller('local')
export class LocalController {
	constructor(private readonly localService: LocalService) {}

	@Get('available')
	async checkLocalAvailability() {
		return this.localService.checkLocalAvailability();
	}

	@Get('base-directory')
	async getBaseDirectory() {
		return this.localService.getBaseDirectory();
	}

	@Post('base-directory/ensure')
	async ensureBaseDirectory() {
		return this.localService.ensureBaseDirectory();
	}

	@Get('discover')
	async discoverLocalProjects() {
		return this.localService.discoverLocalProjects();
	}

	@Post('import/:projectName')
	async importDiscoveredProject(@Param('projectName') projectName: string) {
		return this.localService.importDiscoveredProject(projectName);
	}

	@Post('projects/:projectName/composer/update')
	async runComposerUpdate(@Param('projectName') projectName: string) {
		return this.localService.runComposerUpdate(projectName);
	}

	@Post('projects/:projectName/composer/install')
	async runComposerInstall(@Param('projectName') projectName: string) {
		return this.localService.runComposerInstall(projectName);
	}
}
