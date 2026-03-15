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
import { DomainCreateDto } from './dto/domain-create.dto';
import { DomainUpdateDto } from './dto/domain-update.dto';
import { DomainsService } from './domains.service';

@Controller('domains')
export class DomainsController {
	constructor(
		private readonly domainsService: DomainsService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get('expiring')
	async listExpiringDomains(
		@Query('days') days?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.domainsService.listExpiringDomains(
			days ? Number(days) : 60,
			ownerId,
		);
	}

	@Get('stats/summary')
	async getDomainStats(@Headers('authorization') authorization?: string) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.domainsService.getDomainStats(ownerId);
	}

	@Get('maintenance/status')
	getMaintenanceStatus() {
		return this.domainsService.getRunnerSnapshot();
	}

	@Get()
	async listDomains(
		@Query('status') status?: string,
		@Query('client_id') clientId?: string,
		@Query('registrar') registrar?: string,
		@Query('limit') limit?: string,
		@Query('offset') offset?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.domainsService.listDomains({
			status,
			client_id: clientId ? Number(clientId) : undefined,
			registrar,
			limit: limit ? Number(limit) : undefined,
			offset: offset ? Number(offset) : undefined,
			owner_id: ownerId,
		});
	}

	@Get(':domainId')
	async getDomain(
		@Param('domainId', ParseIntPipe) domainId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.domainsService.getDomain(domainId, ownerId);
	}

	@Post(':domainId/whois/refresh')
	async refreshWhois(
		@Param('domainId', ParseIntPipe) domainId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.domainsService.refreshWhois(domainId, ownerId);
	}

	@Post()
	async createDomain(
		@Body() payload: DomainCreateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.domainsService.createDomain(payload, ownerId);
	}

	@Put(':domainId')
	async updateDomain(
		@Param('domainId', ParseIntPipe) domainId: number,
		@Body() payload: DomainUpdateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.domainsService.updateDomain(domainId, payload, ownerId);
	}

	@Delete(':domainId')
	async deleteDomain(
		@Param('domainId', ParseIntPipe) domainId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.domainsService.deleteDomain(domainId, ownerId);
	}

	@Post(':domainId/renew')
	async renewDomain(
		@Param('domainId', ParseIntPipe) domainId: number,
		@Body() body?: { years?: number },
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.domainsService.renewDomain(domainId, body?.years ?? 1, ownerId);
	}
}
