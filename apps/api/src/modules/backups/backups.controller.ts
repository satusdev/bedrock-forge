import {
	Controller,
	Get,
	Post,
	Delete,
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
import { ROLES, PaginationQuery } from '@bedrock-forge/shared';
import { BackupsService } from './backups.service';
import { EnqueueBackupDto, RestoreBackupDto } from './dto/backup.dto';

@Controller('backups')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class BackupsController {
	constructor(private readonly svc: BackupsService) {}

	@Get('environment/:envId')
	findByEnv(
		@Param('envId', ParseIntPipe) envId: number,
		@Query() q: PaginationQuery,
	) {
		return this.svc.findByEnvironment(envId, q);
	}

	@Get(':id')
	findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOne(id);
	}

	@Post('create')
	enqueueCreate(@Body() dto: EnqueueBackupDto) {
		return this.svc.enqueueCreate(dto);
	}

	@Post('restore')
	enqueueRestore(@Body() dto: RestoreBackupDto) {
		return this.svc.enqueueRestore(dto);
	}

	@Delete(':id')
	@Roles(ROLES.ADMIN)
	@HttpCode(HttpStatus.NO_CONTENT)
	remove(@Param('id', ParseIntPipe) id: number) {
		return this.svc.remove(id);
	}
}
