import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { ThemeScansController } from './theme-scans.controller';
import { ThemeScansService } from './theme-scans.service';
import { ThemeScansRepository } from './theme-scans.repository';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.THEME_SCANS })],
	controllers: [ThemeScansController],
	providers: [ThemeScansService, ThemeScansRepository],
})
export class ThemeScansModule {}
