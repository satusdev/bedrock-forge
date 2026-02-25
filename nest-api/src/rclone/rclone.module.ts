import { Module } from '@nestjs/common';
import { RcloneController } from './rclone.controller';
import { RcloneService } from './rclone.service';

@Module({
	controllers: [RcloneController],
	providers: [RcloneService],
})
export class RcloneModule {}
