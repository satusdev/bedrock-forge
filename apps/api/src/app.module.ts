import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { ClientsModule } from './modules/clients/clients.module';
import { TagsModule } from './modules/tags/tags.module';
import { PackagesModule } from './modules/packages/packages.module';
import { ServersModule } from './modules/servers/servers.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { EnvironmentsModule } from './modules/environments/environments.module';
import { CyberpanelModule } from './modules/cyberpanel/cyberpanel.module';
import { BackupsModule } from './modules/backups/backups.module';
import { PluginScansModule } from './modules/plugin-scans/plugin-scans.module';
import { SyncModule } from './modules/sync/sync.module';
import { DomainsModule } from './modules/domains/domains.module';
import { MonitorsModule } from './modules/monitors/monitors.module';
import { SettingsModule } from './modules/settings/settings.module';
import { JobExecutionsModule } from './modules/job-executions/job-executions.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { GatewaysModule } from './gateways/gateways.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { QUEUES } from '@bedrock-forge/shared';
import appConfig from './config/app.config';

@Module({
	imports: [
		// Configuration
		ConfigModule.forRoot({
			isGlobal: true,
			load: [appConfig],
			envFilePath: ['.env'],
		}),

		// Redis-backed rate limiting
		ThrottlerModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				throttlers: [{ ttl: 60_000, limit: 100 }],
				storage: undefined, // uses memory by default; swap to Redis adapter for prod cluster
			}),
		}),

		// BullMQ queues
		BullModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				connection: {
					url: config.get<string>('redis.url'),
				},
				defaultJobOptions: {
					attempts: 3,
					backoff: { type: 'exponential', delay: 1000 },
					removeOnComplete: 1000,
					removeOnFail: 5000,
				},
			}),
		}),

		// Register all queues
		BullModule.registerQueue(
			{ name: QUEUES.BACKUPS },
			{ name: QUEUES.PLUGIN_SCANS },
			{ name: QUEUES.SYNC },
			{ name: QUEUES.MONITORS },
			{ name: QUEUES.DOMAINS },
			{ name: QUEUES.PROJECTS },
			{ name: QUEUES.NOTIFICATIONS },
		),

		// Infrastructure
		PrismaModule,
		EncryptionModule,

		// Feature modules
		AuthModule,
		HealthModule,
		UsersModule,
		ClientsModule,
		TagsModule,
		PackagesModule,
		ServersModule,
		ProjectsModule,
		EnvironmentsModule,
		CyberpanelModule,
		BackupsModule,
		PluginScansModule,
		SyncModule,
		DomainsModule,
		MonitorsModule,
		SettingsModule,
		JobExecutionsModule,
		InvoicesModule,
		NotificationsModule,
		GatewaysModule,
	],
	providers: [],
})
export class AppModule {}
