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
	NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { EnvironmentsService } from './environments.service';
import {
	CreateEnvironmentDto,
	UpdateEnvironmentDto,
	UpsertDbCredentialsDto,
} from './dto/environment.dto';
import { ScanServerForEnvDto } from './dto/scan-server-for-env.dto';
import { WpQuickLoginDto } from './dto/wp-quick-login.dto';

@Controller('projects/:projectId/environments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class EnvironmentsController {
	constructor(private readonly svc: EnvironmentsService) {}

	@Get()
	findAll(@Param('projectId', ParseIntPipe) projectId: number) {
		return this.svc.findByProject(projectId);
	}

	/**
	 * POST /projects/:projectId/environments/scan-server
	 * SSH into the given server, discover WordPress sites, and return
	 * which are already environments in this project vs. available to add.
	 */
	@Post('scan-server')
	scanServer(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Body() dto: ScanServerForEnvDto,
	) {
		return this.svc.scanServerForNewEnv(projectId, dto.server_id);
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

	@Get(':id/db-credentials')
	async getDbCredentials(@Param('id', ParseIntPipe) id: number) {
		const creds = await this.svc.getDbCredentials(id);
		if (!creds)
			throw new NotFoundException(
				`No DB credentials stored for environment ${id}`,
			);
		return creds;
	}

	@Put(':id/db-credentials')
	upsertDbCredentials(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: UpsertDbCredentialsDto,
	) {
		return this.svc.upsertDbCredentials(id, dto);
	}

	@Get(':id/db-tables')
	listDbTables(@Param('id', ParseIntPipe) id: number) {
		return this.svc.listDbTables(id);
	}

	@Get(':id/wp-users')
	getWpUsers(@Param('id', ParseIntPipe) id: number) {
		return this.svc.getWpUsers(id);
	}

	@Post(':id/wp-quick-login')
	createWpQuickLogin(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: WpQuickLoginDto,
	) {
		return this.svc.createWpQuickLogin(id, dto);
	}
}
