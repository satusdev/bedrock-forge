import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { EnvironmentsService } from './environments.service';

/**
 * Flat, non-nested route for listing all environments.
 * Required so the BackupsPage environment selector works without a project context.
 */
@Controller('environments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class EnvironmentsListController {
	constructor(private readonly svc: EnvironmentsService) {}

	@Get()
	findAll() {
		return this.svc.findAll();
	}
}
