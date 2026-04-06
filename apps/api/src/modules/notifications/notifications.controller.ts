import {
	Controller,
	Get,
	Post,
	Put,
	Delete,
	Body,
	Param,
	Query,
	ParseIntPipe,
	HttpCode,
	HttpStatus,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { CreateChannelDto, UpdateChannelDto } from './dto/notification.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.ADMIN)
export class NotificationsController {
	constructor(private readonly notifService: NotificationsService) {}

	/* ── Channels ─────────────────────────────────────────────────────────── */

	@Get('channels')
	findAllChannels() {
		return this.notifService.findAllChannels();
	}

	@Get('channels/:id')
	findOneChannel(@Param('id', ParseIntPipe) id: number) {
		return this.notifService.findChannelById(id);
	}

	@Post('channels')
	createChannel(@Body() dto: CreateChannelDto) {
		return this.notifService.createChannel(dto);
	}

	@Put('channels/:id')
	updateChannel(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: UpdateChannelDto,
	) {
		return this.notifService.updateChannel(id, dto);
	}

	@Delete('channels/:id')
	@HttpCode(HttpStatus.NO_CONTENT)
	removeChannel(@Param('id', ParseIntPipe) id: number) {
		return this.notifService.removeChannel(id);
	}

	@Post('channels/:id/test')
	testChannel(@Param('id', ParseIntPipe) id: number) {
		return this.notifService.testChannel(id);
	}

	/* ── Logs ─────────────────────────────────────────────────────────────── */

	@Get('logs')
	findRecentLogs(@Query('limit') limit?: string) {
		return this.notifService.findRecentLogs(limit ? parseInt(limit, 10) : 50);
	}
}
