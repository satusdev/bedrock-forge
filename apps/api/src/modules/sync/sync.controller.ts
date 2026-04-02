import {
	Controller,
	Post,
	Body,
	Param,
	UseGuards,
	HttpCode,
	HttpStatus,
	ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { SyncService } from './sync.service';
import { SyncCloneDto, SyncPushDto } from './dto/sync.dto';

@Controller('sync')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class SyncController {
	constructor(private readonly svc: SyncService) {}

	@Post('clone')
	enqueueClone(@Body() dto: SyncCloneDto) {
		return this.svc.enqueueClone(dto);
	}

	@Post('push')
	enqueuePush(@Body() dto: SyncPushDto) {
		return this.svc.enqueuePush(dto);
	}

	@Post('execution/:id/cancel')
	@HttpCode(HttpStatus.OK)
	cancelJobExecution(@Param('id', ParseIntPipe) id: number) {
		return this.svc.cancelJobExecution(id);
	}
}
