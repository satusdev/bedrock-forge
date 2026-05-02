import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { SecurityServerScanProcessor } from './security-server-scan.processor';

@Module({
	imports: [
		BullModule.registerQueue(
			{ name: QUEUES.SECURITY },
			{ name: QUEUES.NOTIFICATIONS },
		),
	],
	providers: [
		// SecurityServerScanProcessor is the unified SecurityScanProcessor —
		// it handles all QUEUES.SECURITY job types (server scan, env scan, schedule tick).
		// Having multiple @Processor classes on the same queue would create a fatal
		// race condition where workers compete for jobs and silently drop them.
		SecurityServerScanProcessor,
	],
})
export class SecurityProcessorModule {}
