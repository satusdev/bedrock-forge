import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	Param,
	ParseIntPipe,
	Patch,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { TagAssignmentDto, TagCreateDto, TagUpdateDto } from './dto/tag.dto';
import { TagsService } from './tags.service';

@Controller('tags')
export class TagsController {
	constructor(
		private readonly tagsService: TagsService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get()
	async listTags(@Query('search') search?: string) {
		return this.tagsService.listTags(search);
	}

	@Post('seed')
	async seedTags() {
		return this.tagsService.seedTags();
	}

	@Get('project/:projectId')
	async getProjectTags(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.tagsService.getProjectTags(projectId, ownerId);
	}

	@Put('project/:projectId')
	async setProjectTags(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Body() payload: TagAssignmentDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.tagsService.setProjectTags(projectId, payload, ownerId);
	}

	@Post('project/:projectId/add/:tagId')
	async addProjectTag(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Param('tagId', ParseIntPipe) tagId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.tagsService.addProjectTag(projectId, tagId, ownerId);
	}

	@Delete('project/:projectId/remove/:tagId')
	async removeProjectTag(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Param('tagId', ParseIntPipe) tagId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.tagsService.removeProjectTag(projectId, tagId, ownerId);
	}

	@Get('client/:clientId')
	async getClientTags(
		@Param('clientId', ParseIntPipe) clientId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.tagsService.getClientTags(clientId, ownerId);
	}

	@Put('client/:clientId')
	async setClientTags(
		@Param('clientId', ParseIntPipe) clientId: number,
		@Body() payload: TagAssignmentDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.tagsService.setClientTags(clientId, payload, ownerId);
	}

	@Post('client/:clientId/add/:tagId')
	async addClientTag(
		@Param('clientId', ParseIntPipe) clientId: number,
		@Param('tagId', ParseIntPipe) tagId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.tagsService.addClientTag(clientId, tagId, ownerId);
	}

	@Delete('client/:clientId/remove/:tagId')
	async removeClientTag(
		@Param('clientId', ParseIntPipe) clientId: number,
		@Param('tagId', ParseIntPipe) tagId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.tagsService.removeClientTag(clientId, tagId, ownerId);
	}

	@Get('server/:serverId')
	async getServerTags(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.tagsService.getServerTags(serverId, ownerId);
	}

	@Put('server/:serverId')
	async setServerTags(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Body() payload: TagAssignmentDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.tagsService.setServerTags(serverId, payload, ownerId);
	}

	@Get(':tagId')
	async getTag(@Param('tagId', ParseIntPipe) tagId: number) {
		return this.tagsService.getTag(tagId);
	}

	@Post()
	async createTag(@Body() payload: TagCreateDto) {
		return this.tagsService.createTag(payload);
	}

	@Patch(':tagId')
	async updateTag(
		@Param('tagId', ParseIntPipe) tagId: number,
		@Body() payload: TagUpdateDto,
	) {
		return this.tagsService.updateTag(tagId, payload);
	}

	@Delete(':tagId')
	async deleteTag(@Param('tagId', ParseIntPipe) tagId: number) {
		return this.tagsService.deleteTag(tagId);
	}
}
