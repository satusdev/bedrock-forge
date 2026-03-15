import { Module } from '@nestjs/common';
import { DriveRuntimeModule } from '../drive-runtime/drive-runtime.module';
import { GdriveController } from './gdrive.controller';
import { GdriveService } from './gdrive.service';

@Module({
	imports: [DriveRuntimeModule],
	controllers: [GdriveController],
	providers: [GdriveService],
})
export class GdriveModule {}
