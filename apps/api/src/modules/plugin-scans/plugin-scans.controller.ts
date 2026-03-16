import {
	Controller,
	Get,
	Post,
	Param,
	Query,
	ParseIntPipe,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES, PaginationQuery } from '@bedrock-forge/shared';
import { PluginScansService } from './plugin-scans.service';

@Controller('plugin-scans')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class PluginScansController {
	constructor(private readonly svc: PluginScansService) {}

	@Get('environment/:envId')
	findByEnv(
		@Param('envId', ParseIntPipe) envId: number,
		@Query() q: PaginationQuery,
	) {
		return this.svc.findByEnvironment(envId, q);
	}

	@Post('environment/:envId/scan')
	enqueueScan(@Param('envId', ParseIntPipe) envId: number) {
		return this.svc.enqueueScan(envId);
	}
}
