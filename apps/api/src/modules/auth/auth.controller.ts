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
	Res,
	UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/auth.dto';
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
	async login(
		@Body() dto: LoginDto,
		@Req() req: ExpressRequest,
		@Res({ passthrough: true }) res: ExpressResponse,
	): Promise<any> {
		const tokenPair = await this.authService.login(
			dto.email,
			dto.password,
			req.headers['user-agent'],
			req.ip,
		);
		this.setRefreshCookie(res, tokenPair.refreshToken);
		return {
			accessToken: tokenPair.accessToken,
			user: tokenPair.user,
		};
	}

	@Post('refresh')
	@HttpCode(HttpStatus.OK)
	@Throttle({ default: { ttl: 60_000, limit: 30 } })
	async refresh(
		@Req() req: ExpressRequest,
		@Res({ passthrough: true }) res: ExpressResponse,
	): Promise<any> {
		const refreshToken = this.getRefreshCookie(req);
		if (!refreshToken) {
			throw new UnauthorizedException('Missing refresh token');
		}
		const tokenPair = await this.authService.refresh(
			refreshToken,
			req.headers['user-agent'],
			req.ip,
		);
		this.setRefreshCookie(res, tokenPair.refreshToken);
		return {
			accessToken: tokenPair.accessToken,
			user: tokenPair.user,
		};
	}

	@Post('logout')
	@HttpCode(HttpStatus.NO_CONTENT)
	async logout(
		@Req() req: ExpressRequest,
		@Res({ passthrough: true }) res: ExpressResponse,
	) {
		const refreshToken = this.getRefreshCookie(req);
		if (refreshToken) {
			await this.authService.logout(refreshToken);
		}
		this.clearRefreshCookie(res);
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

	private setRefreshCookie(res: ExpressResponse, refreshToken: string): void {
		res.cookie('bf_refresh', refreshToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/api/auth',
			maxAge: this.authService.refreshExpiresMs(),
		});
	}

	private clearRefreshCookie(res: ExpressResponse): void {
		res.clearCookie('bf_refresh', {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/api/auth',
		});
	}

	private getRefreshCookie(req: ExpressRequest): string | null {
		const cookieHeader = req.headers.cookie;
		if (!cookieHeader) return null;
		const cookies = cookieHeader.split(';');
		for (const cookie of cookies) {
			const [rawName, ...rawValue] = cookie.trim().split('=');
			if (rawName === 'bf_refresh') {
				try {
					return decodeURIComponent(rawValue.join('='));
				} catch {
					return null;
				}
			}
		}
		return null;
	}
}
