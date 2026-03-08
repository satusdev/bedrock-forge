import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { ClientAuthModule } from './client-auth/client-auth.module';
import { ClientPortalModule } from './client-portal/client-portal.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { ServersModule } from './servers/servers.module';
import { ImportProjectsModule } from './import-projects/import-projects.module';
import { BackupsModule } from './backups/backups.module';
import { SchedulesModule } from './schedules/schedules.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PluginPoliciesModule } from './plugin-policies/plugin-policies.module';
import { DeploymentsModule } from './deployments/deployments.module';
import { ActivityModule } from './activity/activity.module';
import { WpModule } from './wp/wp.module';
import { CyberpanelModule } from './cyberpanel/cyberpanel.module';
import { DomainsModule } from './domains/domains.module';
import { SslModule } from './ssl/ssl.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersModule } from './users/users.module';
import { RbacModule } from './rbac/rbac.module';
import { TagsModule } from './tags/tags.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { LocalModule } from './local/local.module';
import { RcloneModule } from './rclone/rclone.module';
import { SettingsModule } from './settings/settings.module';
import { CloudflareModule } from './cloudflare/cloudflare.module';
import { GithubModule } from './github/github.module';
import { MigrationsModule } from './migrations/migrations.module';
import { GdriveModule } from './gdrive/gdrive.module';
import { SyncModule } from './sync/sync.module';
import { MonitorsModule } from './monitors/monitors.module';
import { CredentialsModule } from './credentials/credentials.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { PackagesModule } from './packages/packages.module';
import { StatusModule } from './status/status.module';
import { WebsocketModule } from './websocket/websocket.module';
import { TaskStatusModule } from './task-status/task-status.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
		}),
		ScheduleModule.forRoot(),
		PrismaModule,
		HealthModule,
		AuthModule,
		ClientAuthModule,
		ClientPortalModule,
		ClientsModule,
		ProjectsModule,
		ServersModule,
		ImportProjectsModule,
		BackupsModule,
		SchedulesModule,
		InvoicesModule,
		PluginPoliciesModule,
		DeploymentsModule,
		ActivityModule,
		WpModule,
		CyberpanelModule,
		DomainsModule,
		SslModule,
		DashboardModule,
		NotificationsModule,
		UsersModule,
		RbacModule,
		TagsModule,
		AnalyticsModule,
		LocalModule,
		RcloneModule,
		SettingsModule,
		CloudflareModule,
		GithubModule,
		MigrationsModule,
		GdriveModule,
		SyncModule,
		MonitorsModule,
		CredentialsModule,
		SubscriptionsModule,
		PackagesModule,
		StatusModule,
		WebsocketModule,
		TaskStatusModule,
	],
})
export class AppModule {}
