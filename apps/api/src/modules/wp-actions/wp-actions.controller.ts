import {
	Controller,
	Get,
	Post,
	Param,
	Body,
	Query,
	ParseIntPipe,
	UseGuards,
	HttpCode,
	HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { WpActionsService } from './wp-actions.service';
import {
	WpFixActionDto,
	WpDebugModeDto,
	WpLogsQueryDto,
} from './dto/wp-actions.dto';

@Controller('environments/:id/wp-actions')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class WpActionsController {
	constructor(private readonly svc: WpActionsService) {}

	/** Enqueue a WordPress quick-fix action (flush rewrite, clear cache, etc.) */
	@Post('fix')
	@HttpCode(HttpStatus.ACCEPTED)
	fix(@Param('id', ParseIntPipe) id: number, @Body() dto: WpFixActionDto) {
		return this.svc.enqueueFix(id, dto);
	}

	/** Synchronously check current WP_DEBUG status via SSH */
	@Get('debug-status')
	debugStatus(@Param('id', ParseIntPipe) id: number) {
		return this.svc.getDebugStatus(id);
	}

	/** Enqueue WP_DEBUG enable/disable (with optional auto-revert) */
	@Post('debug-mode')
	@HttpCode(HttpStatus.ACCEPTED)
	debugMode(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: WpDebugModeDto,
	) {
		return this.svc.enqueueDebugMode(id, dto);
	}

	/** Synchronously fetch log file lines via SSH */
	@Get('logs')
	logs(@Param('id', ParseIntPipe) id: number, @Query() query: WpLogsQueryDto) {
		return this.svc.getLogs(id, query);
	}

	/** Synchronously list WP cron jobs via SSH */
	@Get('cron')
	cron(@Param('id', ParseIntPipe) id: number) {
		return this.svc.getCron(id);
	}

	/** Enqueue DB cleanup (with optional dry-run) */
	@Post('cleanup')
	@HttpCode(HttpStatus.ACCEPTED)
	cleanup(
		@Param('id', ParseIntPipe) id: number,
		@Body('dry_run') dryRun?: boolean,
	) {
		return this.svc.enqueueCleanup(id, dryRun ?? false);
	}
}
