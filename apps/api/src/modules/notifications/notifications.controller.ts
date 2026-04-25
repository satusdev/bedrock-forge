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
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ROLES } from '@bedrock-forge/shared';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.ADMIN)
export class NotificationsController {
        constructor(private readonly notifService: NotificationsService) {}

        /* ── Channels ──────────────────────────────────────────────────────── */
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

        /* ── Logs ──────────────────────────────────────────────────────────── */
        @Get('logs')
        findRecentLogs(@Query('limit') limit?: string) {
                return this.notifService.findRecentLogs(limit ? parseInt(limit, 10) : 50);
        }

        /* ── Inbox (all authenticated users) ───────────────────────────────── */
        @Get('inbox/unread-count')
        @Roles(ROLES.CLIENT)
        getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
                return this.notifService.getUnreadCount(user.id);
        }

        @Get('inbox')
        @Roles(ROLES.CLIENT)
        findInbox(
                @CurrentUser() user: AuthenticatedUser,
                @Query('page') page?: string,
                @Query('limit') limit?: string,
                @Query('unread') unread?: string,
        ) {
                return this.notifService.findInbox(user.id, {
                        page: page ? parseInt(page, 10) : 1,
                        limit: limit ? parseInt(limit, 10) : 20,
                        unread: unread === 'true',
                });
        }

        @Post('inbox/read-all')
        @Roles(ROLES.CLIENT)
        markAllRead(@CurrentUser() user: AuthenticatedUser) {
                return this.notifService.markAllRead(user.id);
        }

        @Post('inbox/:id/read')
        @Roles(ROLES.CLIENT)
        markRead(
                @CurrentUser() user: AuthenticatedUser,
                @Param('id', ParseIntPipe) id: number,
        ) {
                return this.notifService.markRead(id, user.id);
        }
}

