import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	Param,
	ParseIntPipe,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { SslCreateDto } from './dto/ssl-create.dto';
import { SslUpdateDto } from './dto/ssl-update.dto';
import { SslService } from './ssl.service';

@Controller('ssl')
export class SslController {
	constructor(
		private readonly sslService: SslService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get('expiring')
	async listExpiringCertificates(
		@Query('days') days?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.sslService.listExpiringCertificates(
			days ? Number(days) : 14,
			ownerId,
		);
	}

	@Get('stats/summary')
	async getSslStats(@Headers('authorization') authorization?: string) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.sslService.getSslStats(ownerId);
	}

	@Get()
	async listCertificates(
		@Query('provider') provider?: string,
		@Query('is_active') isActive?: string,
		@Query('limit') limit?: string,
		@Query('offset') offset?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.sslService.listCertificates({
			provider,
			is_active: isActive === undefined ? undefined : isActive === 'true',
			limit: limit ? Number(limit) : undefined,
			offset: offset ? Number(offset) : undefined,
			owner_id: ownerId,
		});
	}

	@Get(':certId')
	async getCertificate(
		@Param('certId', ParseIntPipe) certId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.sslService.getCertificate(certId, ownerId);
	}

	@Post()
	async createCertificate(
		@Body() payload: SslCreateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.sslService.createCertificate(payload, ownerId);
	}

	@Put(':certId')
	async updateCertificate(
		@Param('certId', ParseIntPipe) certId: number,
		@Body() payload: SslUpdateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.sslService.updateCertificate(certId, payload, ownerId);
	}

	@Delete(':certId')
	async deleteCertificate(
		@Param('certId', ParseIntPipe) certId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.sslService.deleteCertificate(certId, ownerId);
	}

	@Post(':certId/renew')
	async renewCertificate(
		@Param('certId', ParseIntPipe) certId: number,
		@Body() body?: { new_expiry?: string },
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.sslService.renewCertificate(certId, body?.new_expiry, ownerId);
	}
}
