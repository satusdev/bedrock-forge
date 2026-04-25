import {
	Controller,
	Get,
	Post,
	Delete,
	Param,
	Body,
	ParseIntPipe,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { ConfigDriftService } from './config-drift.service';
import { IsNumber } from 'class-validator';

class SetBaselineDto {
	@IsNumber()
	environmentId!: number;
}

@Controller('projects/:projectId/drift')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class ConfigDriftController {
	constructor(private readonly svc: ConfigDriftService) {}

	@Get()
	getDrift(@Param('projectId', ParseIntPipe) projectId: number) {
		return this.svc.getDrift(projectId);
	}

	@Post('set-baseline')
	setBaseline(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Body() dto: SetBaselineDto,
	) {
		return this.svc.setBaseline(projectId, dto.environmentId);
	}

	@Delete('baseline')
	clearBaseline(@Param('projectId', ParseIntPipe) projectId: number) {
		return this.svc.clearBaseline(projectId);
	}
}
