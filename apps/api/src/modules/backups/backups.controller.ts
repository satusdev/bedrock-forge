import {
	Controller,
	Get,
	Post,
	Delete,
	Param,
	Body,
	Query,
	ParseIntPipe,
	UseGuards,
	HttpCode,
	HttpStatus,
	NotFoundException,
	Res,
} from '@nestjs/common';
import { Response } from 'express';
import { spawn } from 'child_process';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { BackupsService } from './backups.service';
import { EnqueueBackupDto, RestoreBackupDto } from './dto/backup.dto';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

@Controller('backups')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class BackupsController {
	private readonly logger = new Logger(BackupsController.name);

	constructor(
		private readonly svc: BackupsService,
		private readonly config: ConfigService,
	) {}

	@Get('environment/:envId')
	findByEnv(
		@Param('envId', ParseIntPipe) envId: number,
		@Query() q: PaginationQueryDto,
	) {
		return this.svc.findByEnvironment(envId, q);
	}

	/** Fetch a single JobExecution by ID for status/progress/error inspection. */
	@Get('execution/:id')
	findJobExecution(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findJobExecution(id);
	}

	/** Fetch only the execution_log JSONB for a JobExecution — used by the UI expand panel. */
	@Get('execution/:id/log')
	findJobExecutionLog(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findJobExecutionLog(id);
	}

	@Get(':id')
	findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOne(id);
	}

	/**
	 * Stream a completed backup file to the client.
	 * GDrive backups are streamed via `rclone cat`. Local backups are served
	 * directly from disk. Local backups may no longer exist (stored in /tmp).
	 */
	@Get(':id/download')
	async download(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
		const backup = await this.svc.findOne(id);

		if (backup.status !== 'completed' || !backup.file_path) {
			throw new NotFoundException('Backup file is not available for download.');
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
			throw new NotFoundException('Invalid backup file_path format.');
		}
		const folderId = gdrivePath.slice(0, slashIdx);
		const remoteFilename = gdrivePath.slice(slashIdx + 1);

		res.setHeader(
			'Content-Disposition',
			`attachment; filename="${remoteFilename}"`,
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

	@Post('create')
	enqueueCreate(@Body() dto: EnqueueBackupDto) {
		return this.svc.enqueueCreate(dto);
	}

	@Post('restore')
	enqueueRestore(@Body() dto: RestoreBackupDto) {
		return this.svc.enqueueRestore(dto);
	}

	@Delete(':id')
	@Roles(ROLES.ADMIN)
	@HttpCode(HttpStatus.NO_CONTENT)
	remove(@Param('id', ParseIntPipe) id: number) {
		return this.svc.remove(id);
	}
}
