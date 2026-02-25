import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
	@Get('/health')
	getHealth() {
		return {
			status: 'ok',
			service: 'nest-api',
			timestamp: new Date().toISOString(),
		};
	}

	@Get('/migration/status')
	getMigrationStatus() {
		return {
			dbOwner: 'nestjs-prisma',
			pythonScope: 'execution-workers-only',
			phase: 'phase-1-foundation',
		};
	}
}
