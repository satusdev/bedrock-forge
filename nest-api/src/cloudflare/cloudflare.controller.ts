import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { CloudflareService } from './cloudflare.service';
import {
	CloudflareConnectDto,
	CloudflareExpiringQueryDto,
} from './dto/cloudflare.dto';

@Controller('cloudflare')
export class CloudflareController {
	constructor(private readonly cloudflareService: CloudflareService) {}

	@Post('connect')
	async connect(@Body() payload: CloudflareConnectDto) {
		return this.cloudflareService.connect(payload);
	}

	@Delete('disconnect')
	async disconnect() {
		return this.cloudflareService.disconnect();
	}

	@Get('status')
	async getStatus() {
		return this.cloudflareService.getStatus();
	}

	@Get('zones')
	async listZones() {
		return this.cloudflareService.listZones();
	}

	@Post('sync')
	async sync() {
		return this.cloudflareService.sync();
	}

	@Get('expiring')
	async getExpiring(@Query() query: CloudflareExpiringQueryDto) {
		return this.cloudflareService.getExpiring(query.days);
	}
}
