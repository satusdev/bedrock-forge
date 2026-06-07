import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SecurityRepository } from './security.repository';
import { QUEUES, JOB_TYPES, DEFAULT_JOB_OPTIONS } from '@bedrock-forge/shared';
import type { UpsertServerAlertSettingDto } from './dto/server-alert-setting.dto';

export const DEFAULT_SECURITY_ALERT_WATCH_PATHS = [
	'/etc/ssh',
	'/root/.ssh',
	'/home/*/.ssh',
	'/etc/sudoers',
	'/etc/sudoers.d',
	'/etc/crontab',
	'/etc/cron.d',
	'/etc/cron.daily',
	'/etc/cron.hourly',
	'/etc/cron.weekly',
	'/etc/cron.monthly',
	'/root/.bashrc',
	'/root/.profile',
	'/home/*/.bashrc',
	'/home/*/.profile',
	'/var/www/*/wp-config.php',
	'/var/www/*/web/wp-config.php',
	'/var/www/*/web/app/plugins',
	'/var/www/*/web/app/themes',
	'/home/*/public_html/wp-config.php',
	'/home/*/public_html/wp-content/plugins',
	'/home/*/public_html/wp-content/themes',
];

@Injectable()
export class SecurityAlertsService {
	constructor(
		private readonly repo: SecurityRepository,
		@InjectQueue(QUEUES.SECURITY) private readonly securityQueue: Queue,
	) {}

	async getServerAlertSetting(serverId: number) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);

		const setting = await this.repo.findServerAlertSetting(BigInt(serverId));
		return (
			setting ?? {
				server_id: BigInt(serverId),
				enabled: false,
				ssh_login_alerts_enabled: true,
				file_change_alerts_enabled: true,
				interval_minutes: 5,
				file_watch_paths: DEFAULT_SECURITY_ALERT_WATCH_PATHS,
				last_checked_at: null,
				last_auth_cursor: null,
				file_snapshot: null,
			}
		);
	}

	async upsertServerAlertSetting(
		serverId: number,
		dto: UpsertServerAlertSettingDto,
	) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);

		const existing = await this.repo.findServerAlertSetting(BigInt(serverId));
		const current = existing ?? {
			enabled: false,
			ssh_login_alerts_enabled: true,
			file_change_alerts_enabled: true,
			interval_minutes: 5,
			file_watch_paths: DEFAULT_SECURITY_ALERT_WATCH_PATHS,
		};

		return this.repo.upsertServerAlertSetting(BigInt(serverId), {
			enabled: dto.enabled ?? current.enabled,
			ssh_login_alerts_enabled:
				dto.ssh_login_alerts_enabled ?? current.ssh_login_alerts_enabled,
			file_change_alerts_enabled:
				dto.file_change_alerts_enabled ?? current.file_change_alerts_enabled,
			interval_minutes: dto.interval_minutes ?? current.interval_minutes,
			file_watch_paths:
				dto.file_watch_paths && dto.file_watch_paths.length > 0
					? dto.file_watch_paths
					: current.file_watch_paths.length > 0
						? current.file_watch_paths
						: DEFAULT_SECURITY_ALERT_WATCH_PATHS,
		});
	}

	async testServerAlertSetting(serverId: number) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);
		const existing = await this.repo.findServerAlertSetting(BigInt(serverId));
		if (!existing) {
			await this.repo.upsertServerAlertSetting(BigInt(serverId), {
				enabled: false,
				ssh_login_alerts_enabled: true,
				file_change_alerts_enabled: true,
				interval_minutes: 5,
				file_watch_paths: DEFAULT_SECURITY_ALERT_WATCH_PATHS,
			});
		}

		const job = await this.securityQueue.add(
			JOB_TYPES.SECURITY_ALERT_POLL,
			{ serverId, force: true },
			{
				...DEFAULT_JOB_OPTIONS,
				jobId: `security-alert-test-${serverId}-${Date.now()}`,
			},
		);

		return { jobId: String(job.id) };
	}
}
