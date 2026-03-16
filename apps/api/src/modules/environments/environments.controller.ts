import {
	Controller,
	Get,
	Post,
	Put,
	Delete,
	Param,
	Body,
	ParseIntPipe,
	UseGuards,
	HttpCode,
	HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { EnvironmentsService } from './environments.service';
import {
	CreateEnvironmentDto,
	UpdateEnvironmentDto,
} from './dto/environment.dto';

@Controller('projects/:projectId/environments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class EnvironmentsController {
	constructor(private readonly svc: EnvironmentsService) {}

	@Get()
	findAll(@Param('projectId', ParseIntPipe) projectId: number) {
		return this.svc.findByProject(projectId);
	}

	@Get(':id')
	findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOne(id);
	}

	@Post()
	create(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Body() dto: CreateEnvironmentDto,
	) {
		return this.svc.create(projectId, dto);
	}

	@Put(':id')
	update(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: UpdateEnvironmentDto,
	) {
		return this.svc.update(id, dto);
	}

	@Delete(':id')
	@Roles(ROLES.ADMIN)
	@HttpCode(HttpStatus.NO_CONTENT)
	remove(@Param('id', ParseIntPipe) id: number) {
		return this.svc.remove(id);
	}
}
