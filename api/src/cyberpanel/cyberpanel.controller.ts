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
import { CreateDatabaseDto } from './dto/create-database.dto';
import { CreateWebsiteDto } from './dto/create-website.dto';
import { CyberpanelService } from './cyberpanel.service';

@Controller('cyberpanel')
export class CyberpanelController {
	constructor(private readonly cyberpanelService: CyberpanelService) {}

	@Get('servers/:serverId/verify')
	async verify(@Param('serverId', ParseIntPipe) serverId: number) {
		return this.cyberpanelService.verify(serverId);
	}

	@Get('servers/:serverId/websites')
	async listWebsites(@Param('serverId', ParseIntPipe) serverId: number) {
		return this.cyberpanelService.listWebsites(serverId);
	}

	@Post('servers/:serverId/websites')
	async createWebsite(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Body() payload: CreateWebsiteDto,
	) {
		return this.cyberpanelService.createWebsite(serverId, payload);
	}

	@Delete('servers/:serverId/websites/:domain')
	async deleteWebsite(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Param('domain') domain: string,
	) {
		return this.cyberpanelService.deleteWebsite(serverId, domain);
	}

	@Get('servers/:serverId/databases')
	async listDatabases(@Param('serverId', ParseIntPipe) serverId: number) {
		return this.cyberpanelService.listDatabases(serverId);
	}

	@Post('servers/:serverId/databases')
	async createDatabase(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Body() payload: CreateDatabaseDto,
	) {
		return this.cyberpanelService.createDatabase(serverId, payload);
	}

	@Delete('servers/:serverId/databases/:dbName')
	async deleteDatabase(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Param('dbName') dbName: string,
	) {
		return this.cyberpanelService.deleteDatabase(serverId, dbName);
	}

	@Post('servers/:serverId/ssl/:domain')
	async issueSsl(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Param('domain') domain: string,
	) {
		return this.cyberpanelService.issueSsl(serverId, domain);
	}

	@Post('servers/:serverId/websites/:domain/ssl')
	async issueWebsiteSsl(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Param('domain') domain: string,
	) {
		return this.cyberpanelService.issueSsl(serverId, domain);
	}

	@Get('servers/:serverId/websites/:domain/stats')
	async getWebsiteStats(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Param('domain') domain: string,
	) {
		return this.cyberpanelService.getWebsiteStats(serverId, domain);
	}

	@Put('servers/:serverId/websites/:domain/php')
	async changePhpVersion(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Param('domain') domain: string,
		@Body() payload: { php_version: string },
	) {
		return this.cyberpanelService.changePhpVersion(
			serverId,
			domain,
			payload.php_version,
		);
	}

	@Get('servers/:serverId/wordpress')
	async scanWordpressSites(@Param('serverId', ParseIntPipe) serverId: number) {
		return this.cyberpanelService.scanWordpressSites(serverId);
	}

	@Get('servers/:serverId/info')
	async getServerInfo(@Param('serverId', ParseIntPipe) serverId: number) {
		return this.cyberpanelService.getServerInfo(serverId);
	}

	@Get('servers/:serverId/users')
	async listUsers(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Query('sync') sync?: string,
	) {
		return this.cyberpanelService.listUsers(serverId, sync === 'true');
	}

	@Post('servers/:serverId/users')
	async createUser(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Body()
		payload: {
			username: string;
			email: string;
			password?: string;
			first_name?: string;
			last_name?: string;
			user_type?: string;
			websites_limit?: number;
			disk_limit?: number;
			bandwidth_limit?: number;
			package_name?: string;
			notes?: string;
		},
	) {
		return this.cyberpanelService.createUser(serverId, payload);
	}

	@Get('servers/:serverId/users/:username')
	async getUser(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Param('username') username: string,
	) {
		return this.cyberpanelService.getUser(serverId, username);
	}

	@Put('servers/:serverId/users/:username')
	async updateUser(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Param('username') username: string,
		@Body()
		payload: {
			email?: string;
			first_name?: string;
			last_name?: string;
			websites_limit?: number;
			disk_limit?: number;
			bandwidth_limit?: number;
			notes?: string;
		},
	) {
		return this.cyberpanelService.updateUser(serverId, username, payload);
	}

	@Delete('servers/:serverId/users/:username')
	async deleteUser(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Param('username') username: string,
	) {
		return this.cyberpanelService.deleteUser(serverId, username);
	}

	@Post('servers/:serverId/users/:username/password')
	async changeUserPassword(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Param('username') username: string,
		@Body() payload: { new_password?: string },
	) {
		return this.cyberpanelService.changeUserPassword(
			serverId,
			username,
			payload.new_password,
		);
	}

	@Post('servers/:serverId/users/:username/reveal-password')
	async revealUserPassword(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Param('username') username: string,
	) {
		return this.cyberpanelService.revealUserPassword(serverId, username);
	}

	@Post('servers/:serverId/users/:username/suspend')
	async suspendUser(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Param('username') username: string,
	) {
		return this.cyberpanelService.suspendUser(serverId, username);
	}

	@Post('servers/:serverId/users/:username/unsuspend')
	async unsuspendUser(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Param('username') username: string,
	) {
		return this.cyberpanelService.unsuspendUser(serverId, username);
	}

	@Get('servers/:serverId/packages')
	async listPackages(@Param('serverId', ParseIntPipe) serverId: number) {
		return this.cyberpanelService.listPackages(serverId);
	}

	@Get('servers/:serverId/acls')
	async listAcls(@Param('serverId', ParseIntPipe) serverId: number) {
		return this.cyberpanelService.listAcls(serverId);
	}
}
