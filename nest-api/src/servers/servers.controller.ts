import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	HttpCode,
	Param,
	ParseIntPipe,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ServerCreateDto } from './dto/server-create.dto';
import { ServerUpdateDto } from './dto/server-update.dto';
import { ServersService } from './servers.service';

@Controller('servers')
export class ServersController {
	constructor(
		private readonly serversService: ServersService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get()
	async listServers(
		@Query('skip') skip?: string,
		@Query('limit') limit?: string,
		@Headers('authorization') authorization?: string,
	) {
		const parsedSkip = Number.isNaN(Number(skip)) ? 0 : Number(skip ?? 0);
		const parsedLimit = Number.isNaN(Number(limit))
			? 100
			: Number(limit ?? 100);
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.listServers(parsedSkip, parsedLimit, ownerId);
	}

	@Post()
	async createServer(
		@Body() payload: ServerCreateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.createServer(payload, ownerId);
	}

	@Get('tags/all')
	async getAllTags(@Headers('authorization') authorization?: string) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.getAllTags(ownerId);
	}

	@Put(':serverId/tags')
	async updateServerTags(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Body() tags: string[],
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.updateServerTags(serverId, tags, ownerId);
	}

	@Get(':serverId/tags')
	async getServerTags(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.getServerTags(serverId, ownerId);
	}

	@Get(':serverId')
	async getServer(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.getServer(serverId, ownerId);
	}

	@Put(':serverId')
	async updateServer(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Body() payload: ServerUpdateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.updateServer(serverId, payload, ownerId);
	}

	@Delete(':serverId')
	@HttpCode(204)
	async deleteServer(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		await this.serversService.deleteServer(serverId, ownerId);
	}

	@Post(':serverId/test')
	async testServerConnection(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.testServerConnection(serverId, ownerId);
	}

	@Get(':serverId/health')
	async getHealth(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.getHealth(serverId, ownerId);
	}

	@Post(':serverId/health/trigger')
	async triggerHealthCheck(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.triggerHealthCheck(serverId, ownerId);
	}

	@Get(':serverId/panel/login-url')
	async getPanelLoginUrl(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.getPanelLoginUrl(serverId, ownerId);
	}

	@Post(':serverId/panel/session-url')
	async getPanelSessionUrl(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.getPanelSessionUrl(serverId, ownerId);
	}

	@Post(':serverId/scan-sites')
	async scanSites(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Query('base_path') basePath?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.scanSites(serverId, basePath, ownerId);
	}

	@Post(':serverId/scan-directories')
	async scanDirectories(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Query('base_path') basePath?: string,
		@Query('max_depth') maxDepth?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.scanDirectories(
			serverId,
			basePath,
			maxDepth ? Number(maxDepth) : undefined,
			ownerId,
		);
	}

	@Get(':serverId/directories')
	async getDirectories(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.getDirectories(serverId, ownerId);
	}

	@Post(':serverId/read-env')
	async readEnv(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Query('path') path: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.serversService.readEnv(serverId, path, ownerId);
	}
}
