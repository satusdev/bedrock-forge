import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
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
import { ReportsModule } from './modules/reports/reports.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { GatewaysModule } from './gateways/gateways.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
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
			useFactory: () => ({
				throttlers: [{ ttl: 60_000, limit: 100 }],
			}),
		}),

		// Nightly cleanup cron jobs
		ScheduleModule.forRoot(),

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
			{ name: QUEUES.REPORTS },
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
		ReportsModule,
		MaintenanceModule,
		AuditLogsModule,
		DashboardModule,
		GatewaysModule,
	],
	providers: [
		// Global rate limiting — 100 req/min per IP (ThrottlerModule configured above)
		{ provide: APP_GUARD, useClass: ThrottlerGuard },
		// Global exception handler — normalises all errors to { statusCode, timestamp, path, message }
		{ provide: APP_FILTER, useClass: HttpExceptionFilter },
		// Global audit trail — logs all non-GET requests to audit_logs
		{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
	],
})
export class AppModule {}
