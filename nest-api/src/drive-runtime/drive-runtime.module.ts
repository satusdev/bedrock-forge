import { Module } from '@nestjs/common';
import { DriveRuntimeConfigService } from './drive-runtime-config.service';

@Module({
	providers: [DriveRuntimeConfigService],
	exports: [DriveRuntimeConfigService],
})
export class DriveRuntimeModule {}
