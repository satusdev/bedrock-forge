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
import { PluginManageDto, UpdateAllPluginsDto, TogglePluginStatusDto } from './dto/plugin-manage.dto';
import { ChangeConstraintDto } from './dto/change-constraint.dto';

@Controller('plugin-scans')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class PluginScansController {
	constructor(private readonly svc: PluginScansService) {}

	@Get('search-wp-org')
	searchWpOrg(@Query('q') query: string) {
		return this.svc.searchWpOrg(query);
	}

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

	@Post('bulk/scan')
	enqueueBulkScan() {
		return this.svc.enqueueBulkScan();
	}

	@Post('environment/:envId/plugins')
	addPlugin(
		@Param('envId', ParseIntPipe) envId: number,
		@Body() dto: PluginManageDto,
	) {
		return this.svc.enqueuePluginManage(
			envId,
			'add',
			dto.slug,
			dto.version,
			dto.skipSafetyBackup,
			dto.workflow,
		);
	}

	@Delete('environment/:envId/plugins/:slug')
	removePlugin(
		@Param('envId', ParseIntPipe) envId: number,
		@Param('slug') slug: string,
		@Query('skipSafetyBackup') skipSafetyBackup?: string,
	) {
		return this.svc.enqueuePluginManage(
			envId,
			'delete',
			slug,
			undefined,
			skipSafetyBackup === 'true',
		);
	}

	@Put('environment/:envId/plugins/:slug/status')
	toggleStatus(
		@Param('envId', ParseIntPipe) envId: number,
		@Param('slug') slug: string,
		@Body() dto: TogglePluginStatusDto,
	) {
		return this.svc.enqueuePluginManage(
			envId,
			dto.active ? 'activate' : 'deactivate',
			slug,
			undefined,
			dto.skipSafetyBackup,
		);
	}

	@Post('environment/:envId/plugins/:slug/migrate')
	migrateToComposer(
		@Param('envId', ParseIntPipe) envId: number,
		@Param('slug') slug: string,
		@Body() dto: UpdateAllPluginsDto,
	) {
		return this.svc.enqueuePluginManage(
			envId,
			'migrate-to-composer',
			slug,
			undefined,
			dto.skipSafetyBackup,
		);
	}

	@Put('environment/:envId/plugins/:slug')
	updatePlugin(
		@Param('envId', ParseIntPipe) envId: number,
		@Param('slug') slug: string,
		@Body() dto: Partial<PluginManageDto>,
	) {
		return this.svc.enqueuePluginManage(
			envId,
			'update',
			slug,
			dto.version,
			dto.skipSafetyBackup,
		);
	}

	@Put('environment/:envId/plugins')
	updateAllPlugins(
		@Param('envId', ParseIntPipe) envId: number,
		@Body() dto: UpdateAllPluginsDto,
	) {
		return this.svc.enqueuePluginManage(
			envId,
			'update-all',
			undefined,
			undefined,
			dto.skipSafetyBackup,
		);
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

	// ─── Custom GitHub Plugin routes ─────────────────────────────────────────

	/** List custom plugins installed on this environment */
	@Get('environment/:envId/custom-plugins')
	listCustomPlugins(@Param('envId', ParseIntPipe) envId: number) {
		return this.svc.listEnvironmentCustomPlugins(envId);
	}

	/** Enqueue install of a custom GitHub plugin on this environment */
	@Post('environment/:envId/custom-plugins/:customPluginId')
	installCustomPlugin(
		@Param('envId', ParseIntPipe) envId: number,
		@Param('customPluginId', ParseIntPipe) customPluginId: number,
	) {
		return this.svc.enqueueCustomPluginManage(envId, customPluginId, 'add');
	}

	/** Enqueue removal of a custom GitHub plugin from this environment */
	@Delete('environment/:envId/custom-plugins/:customPluginId')
	uninstallCustomPlugin(
		@Param('envId', ParseIntPipe) envId: number,
		@Param('customPluginId', ParseIntPipe) customPluginId: number,
	) {
		return this.svc.enqueueCustomPluginManage(envId, customPluginId, 'remove');
	}

	/** Check latest GitHub tags for all installed custom plugins and persist results */
	@Post('environment/:envId/custom-plugins/check-versions')
	checkCustomPluginVersions(@Param('envId', ParseIntPipe) envId: number) {
		return this.svc.checkCustomPluginVersions(envId);
	}
}
