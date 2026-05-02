import {
	Controller,
	Post,
	Put,
	Delete,
	Body,
	HttpCode,
	HttpStatus,
	UseGuards,
	Get,
	Req,
	Param,
	ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
	CurrentUser,
	AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('login')
	@HttpCode(HttpStatus.OK)
	@Throttle({ default: { ttl: 15 * 60_000, limit: 5 } })
	async login(@Body() dto: LoginDto, @Req() req: ExpressRequest): Promise<any> {
		return this.authService.login(
			dto.email,
			dto.password,
			req.headers['user-agent'],
			req.ip,
		);
	}

	@Post('refresh')
	@HttpCode(HttpStatus.OK)
	@Throttle({ default: { ttl: 60_000, limit: 30 } })
	async refresh(
		@Body() dto: RefreshTokenDto,
		@Req() req: ExpressRequest,
	): Promise<any> {
		return this.authService.refresh(
			dto.refreshToken,
			req.headers['user-agent'],
			req.ip,
		);
	}

	@Post('logout')
	@HttpCode(HttpStatus.NO_CONTENT)
	async logout(@Body() dto: RefreshTokenDto) {
		await this.authService.logout(dto.refreshToken);
	}

	@Post('logout-all')
	@UseGuards(AuthGuard('jwt'))
	@HttpCode(HttpStatus.NO_CONTENT)
	async logoutAll(@CurrentUser() user: AuthenticatedUser) {
		await this.authService.logoutAll(user.id);
	}

	@Put('change-password')
	@UseGuards(AuthGuard('jwt'))
	@HttpCode(HttpStatus.NO_CONTENT)
	async changePassword(
		@CurrentUser() user: AuthenticatedUser,
		@Body() dto: ChangePasswordDto,
	) {
		await this.authService.changePassword(
			user.id,
			dto.current_password,
			dto.new_password,
		);
	}

	@Get('me')
	@UseGuards(AuthGuard('jwt'))
	me(@CurrentUser() user: AuthenticatedUser) {
		return user;
	}

	@Get('sessions')
	@UseGuards(AuthGuard('jwt'))
	getSessions(@CurrentUser() user: AuthenticatedUser) {
		return this.authService.getSessions(user.id);
	}

	@Delete('sessions/:id')
	@UseGuards(AuthGuard('jwt'))
	@HttpCode(HttpStatus.NO_CONTENT)
	async revokeSession(
		@CurrentUser() user: AuthenticatedUser,
		@Param('id', ParseIntPipe) sessionId: number,
	) {
		await this.authService.revokeSession(user.id, sessionId);
	}
}
