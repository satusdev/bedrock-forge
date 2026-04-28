import {
	Controller,
	Get,
	Post,
	Param,
	Query,
	UseGuards,
	HttpCode,
	HttpStatus,
	ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SystemBackupsService } from './system-backups.service';

@Controller('system-backups')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.ADMIN)
export class SystemBackupsController {
	constructor(private readonly svc: SystemBackupsService) {}

	/** List all Forge system backups, newest first. */
	@Get()
	list(@Query() q: PaginationQueryDto) {
		return this.svc.list(q.page ?? 1, q.limit ?? 20);
	}

	/** Get a single system backup by ID. */
	@Get(':id')
	findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOne(id);
	}

	/** Trigger a manual Forge DB backup to Google Drive. */
	@Post()
	@HttpCode(HttpStatus.ACCEPTED)
	create() {
		return this.svc.enqueueCreate();
	}
}
