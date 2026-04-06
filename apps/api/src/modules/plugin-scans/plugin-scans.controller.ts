import {
	Controller,
	Get,
	Post,
	Put,
	Patch,
	Delete,
	Body,
	Param,
	Query,
	ParseIntPipe,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PluginScansService } from './plugin-scans.service';
import { PluginManageDto } from './dto/plugin-manage.dto';
import { ChangeConstraintDto } from './dto/change-constraint.dto';

@Controller('plugin-scans')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class PluginScansController {
	constructor(private readonly svc: PluginScansService) {}

	@Get('environment/:envId')
	findByEnv(
		@Param('envId', ParseIntPipe) envId: number,
		@Query() q: PaginationQueryDto,
	) {
		return this.svc.findByEnvironment(envId, q);
	}

	@Post('environment/:envId/scan')
	enqueueScan(@Param('envId', ParseIntPipe) envId: number) {
		return this.svc.enqueueScan(envId);
	}

	@Post('environment/:envId/plugins')
	addPlugin(
		@Param('envId', ParseIntPipe) envId: number,
		@Body() dto: PluginManageDto,
	) {
		return this.svc.enqueuePluginManage(envId, 'add', dto.slug, dto.version);
	}

	@Delete('environment/:envId/plugins/:slug')
	removePlugin(
		@Param('envId', ParseIntPipe) envId: number,
		@Param('slug') slug: string,
	) {
		return this.svc.enqueuePluginManage(envId, 'remove', slug);
	}

	@Put('environment/:envId/plugins/:slug')
	updatePlugin(
		@Param('envId', ParseIntPipe) envId: number,
		@Param('slug') slug: string,
		@Body() dto: Partial<PluginManageDto>,
	) {
		return this.svc.enqueuePluginManage(envId, 'update', slug, dto.version);
	}

	@Put('environment/:envId/plugins')
	updateAllPlugins(@Param('envId', ParseIntPipe) envId: number) {
		return this.svc.enqueuePluginManage(envId, 'update-all');
	}

	/** Change the composer version constraint for a specific plugin */
	@Patch('environment/:envId/plugins/:slug/constraint')
	changeConstraint(
		@Param('envId', ParseIntPipe) envId: number,
		@Param('slug') slug: string,
		@Body() dto: ChangeConstraintDto,
	) {
		return this.svc.enqueueConstraintChange(envId, slug, dto.constraint);
	}

	/** Enqueue a composer.json read and return the job execution ID for polling */
	@Post('environment/:envId/composer')
	readComposerJson(@Param('envId', ParseIntPipe) envId: number) {
		return this.svc.enqueueComposerRead(envId);
	}

	/** Get job execution status and log (used to retrieve composer read results) */
	@Get('execution/:execId')
	getExecution(@Param('execId', ParseIntPipe) execId: number) {
		return this.svc.findExecution(execId);
	}
}
