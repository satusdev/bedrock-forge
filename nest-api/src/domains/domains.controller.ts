import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { DomainCreateDto } from './dto/domain-create.dto';
import { DomainUpdateDto } from './dto/domain-update.dto';
import { DomainsService } from './domains.service';

@Controller('domains')
export class DomainsController {
	constructor(private readonly domainsService: DomainsService) {}

	@Get('expiring')
	async listExpiringDomains(@Query('days') days?: string) {
		return this.domainsService.listExpiringDomains(days ? Number(days) : 60);
	}

	@Get('stats/summary')
	async getDomainStats() {
		return this.domainsService.getDomainStats();
	}

	@Get()
	async listDomains(
		@Query('status') status?: string,
		@Query('client_id') clientId?: string,
		@Query('registrar') registrar?: string,
		@Query('limit') limit?: string,
		@Query('offset') offset?: string,
	) {
		return this.domainsService.listDomains({
			status,
			client_id: clientId ? Number(clientId) : undefined,
			registrar,
			limit: limit ? Number(limit) : undefined,
			offset: offset ? Number(offset) : undefined,
		});
	}

	@Get(':domainId')
	async getDomain(@Param('domainId', ParseIntPipe) domainId: number) {
		return this.domainsService.getDomain(domainId);
	}

	@Post(':domainId/whois/refresh')
	async refreshWhois(@Param('domainId', ParseIntPipe) domainId: number) {
		return this.domainsService.refreshWhois(domainId);
	}

	@Post()
	async createDomain(@Body() payload: DomainCreateDto) {
		return this.domainsService.createDomain(payload);
	}

	@Put(':domainId')
	async updateDomain(
		@Param('domainId', ParseIntPipe) domainId: number,
		@Body() payload: DomainUpdateDto,
	) {
		return this.domainsService.updateDomain(domainId, payload);
	}

	@Delete(':domainId')
	async deleteDomain(@Param('domainId', ParseIntPipe) domainId: number) {
		return this.domainsService.deleteDomain(domainId);
	}

	@Post(':domainId/renew')
	async renewDomain(
		@Param('domainId', ParseIntPipe) domainId: number,
		@Body() body?: { years?: number },
	) {
		return this.domainsService.renewDomain(domainId, body?.years ?? 1);
	}
}
