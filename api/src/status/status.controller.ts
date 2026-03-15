import {
	Controller,
	Get,
	Headers,
	Param,
	ParseIntPipe,
	Query,
	Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { StatusService } from './status.service';

@Controller('status')
export class StatusController {
	constructor(
		private readonly statusService: StatusService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get(':projectId')
	async getStatusPage(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Query('page') page?: string,
		@Query('page_size') pageSize?: string,
		@Headers('authorization') authorization?: string,
		@Res({ passthrough: true }) response?: Response,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		response?.setHeader('Cache-Control', 'public, max-age=60');
		return this.statusService.getStatusPage(
			projectId,
			page ? Number(page) : undefined,
			pageSize ? Number(pageSize) : undefined,
			ownerId,
		);
	}

	@Get(':projectId/history')
	async getStatusHistory(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Query('days') days?: string,
		@Headers('authorization') authorization?: string,
		@Res({ passthrough: true }) response?: Response,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		response?.setHeader('Cache-Control', 'public, max-age=300');
		return this.statusService.getStatusHistory(
			projectId,
			days ? Number(days) : undefined,
			ownerId,
		);
	}
}
