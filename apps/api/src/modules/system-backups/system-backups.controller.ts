import { Throttle } from '@nestjs/throttler';
import {
	Controller,
	Get,
	Post,
	Put,
	Delete,
	Body,
	Param,
	Query,
	UseGuards,
	HttpCode,
	HttpStatus,
	ParseIntPipe,
	Res,
	NotFoundException,
	Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { spawn } from 'child_process';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SystemBackupsService } from './system-backups.service';
import { SystemBackupScheduleService } from './system-backup-schedule.service';
import { UpsertSystemBackupScheduleDto } from './system-backup-schedule.dto';

@Controller('system-backups')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.ADMIN)
export class SystemBackupsController {
	private readonly logger = new Logger(SystemBackupsController.name);

	constructor(
		private readonly svc: SystemBackupsService,
		private readonly scheduleSvc: SystemBackupScheduleService,
		private readonly config: ConfigService,
	) {}

	/** List all Forge system backups, newest first. */
	@Get()
	list(@Query() q: PaginationQueryDto) {
		return this.svc.list(q.page ?? 1, q.limit ?? 20);
	}

	// ── Schedule routes (must precede :id to avoid parameter capture) ────────

	/** Get the current system backup schedule (or null). */
	@Get('schedule')
	getSchedule() {
		return this.scheduleSvc.findSchedule();
	}

	/** Create or update the system backup schedule. */
	@Put('schedule')
	upsertSchedule(@Body() dto: UpsertSystemBackupScheduleDto) {
		return this.scheduleSvc.upsert(dto);
	}

	/** Delete the system backup schedule and remove the repeatable job. */
	@Delete('schedule')
	@HttpCode(HttpStatus.NO_CONTENT)
	removeSchedule() {
		return this.scheduleSvc.remove();
	}

	/** Get a single system backup by ID. */
	@Get(':id')
	findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOne(id);
	}

	/** Stream a completed system backup file from Google Drive via rclone cat. */
	@Get(':id/download')
	async download(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
		const backup = await this.svc.findOne(id);

		if (backup.status !== 'completed' || !backup.file_path) {
			throw new NotFoundException(
				'System backup file is not available for download.',
			);
		}

		if (!backup.file_path.startsWith('gdrive:')) {
			throw new NotFoundException(
				'Only Google Drive backups are supported for download.',
			);
		}

		const rcloneConfigPath = this.config.get<string>('app.rcloneConfigPath')!;
		const remoteName =
			this.config.get<string>('app.rcloneRemoteName') ?? 'gdrive';

		// Parse stored format: gdrive:{folderId}/{filename}
		const gdrivePath = backup.file_path.slice('gdrive:'.length);
		const slashIdx = gdrivePath.indexOf('/');
		if (slashIdx < 1) {
			throw new NotFoundException('Invalid system backup file_path format.');
		}
		const folderId = gdrivePath.slice(0, slashIdx);
		const remoteFilename = gdrivePath.slice(slashIdx + 1);

		// Sanitize filename
		const safeFilename = remoteFilename.replace(/["|\\\r\n]/g, '_');
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="${safeFilename}"`,
		);
		res.setHeader('Content-Type', 'application/octet-stream');

		const child = spawn(
			'rclone',
			[
				'cat',
				'--config',
				rcloneConfigPath,
				'--drive-root-folder-id',
				folderId,
				`${remoteName}:${remoteFilename}`,
			],
			{ stdio: ['ignore', 'pipe', 'pipe'] },
		);

		child.stdout.pipe(res);

		child.stderr.on('data', (d: Buffer) => {
			this.logger.error(`rclone cat stderr: ${d.toString()}`);
		});

		child.on('error', (err: Error) => {
			this.logger.error(`rclone process error: ${err.message}`);
			if (!res.headersSent) res.status(500).end();
		});

		child.on('close', (code: number | null) => {
			if (code !== 0 && !res.writableEnded) {
				this.logger.error(`rclone cat exited with code ${code}`);
				res.end();
			}
		});
	}

	/** Trigger a manual Forge DB backup to Google Drive. */
	@Post()
	@HttpCode(HttpStatus.ACCEPTED)
	@Throttle({ default: { ttl: 300_000, limit: 3 } })
	create() {
		return this.svc.enqueueCreate();
	}
}
