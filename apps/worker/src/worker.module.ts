import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { PrismaModule } from './prisma/prisma.module';
import { EncryptionModule } from './encryption/encryption.module';
import { BackupProcessorModule } from './processors/backup/backup-processor.module';
import { PluginScanProcessorModule } from './processors/plugin-scan/plugin-scan-processor.module';
import { SyncProcessorModule } from './processors/sync/sync-processor.module';
import { MonitorProcessorModule } from './processors/monitor/monitor-processor.module';
import { DomainWhoisProcessorModule } from './processors/domain-whois/domain-whois-processor.module';
import { CreateBedrockProcessorModule } from './processors/create-bedrock/create-bedrock-processor.module';
import { NotificationProcessorModule } from './processors/notification/notification-processor.module';
import { ReportProcessorModule } from './processors/report/report-processor.module';
import { SshKeyModule } from './services/ssh-key.module';
import workerConfig from './config/worker.config';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [workerConfig],
			envFilePath: ['.env'],
		}),

		BullModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				connection: { url: config.get<string>('redis.url') },
			}),
		}),

		BullModule.registerQueue(
			{ name: QUEUES.BACKUPS },
			{ name: QUEUES.PLUGIN_SCANS },
			{ name: QUEUES.SYNC },
			{ name: QUEUES.MONITORS },
			{ name: QUEUES.DOMAINS },
			{ name: QUEUES.PROJECTS },
			{ name: QUEUES.NOTIFICATIONS },
			{ name: QUEUES.REPORTS },
		),

		PrismaModule,
		EncryptionModule,
		SshKeyModule,

		BackupProcessorModule,
		PluginScanProcessorModule,
		SyncProcessorModule,
		MonitorProcessorModule,
		DomainWhoisProcessorModule,
		CreateBedrockProcessorModule,
		NotificationProcessorModule,
		ReportProcessorModule,
	],
})
export class WorkerModule {}
