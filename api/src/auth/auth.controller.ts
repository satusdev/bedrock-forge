import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { UserUpdateDto } from './dto/user-update.dto';
import { PasswordChangeDto } from './dto/password-change.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthenticatedUser } from './authenticated-user';

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('login')
	async login(@Body() payload: LoginDto) {
		return this.authService.login(payload);
	}

	@Post('register')
	async register(@Body() payload: RegisterDto) {
		return this.authService.register(payload);
	}

	@Post('refresh')
	async refresh(@Body() payload: RefreshTokenDto) {
		return this.authService.refresh(payload);
	}

	@UseGuards(JwtAuthGuard)
	@Get('me')
	async me(@CurrentUser() currentUser?: AuthenticatedUser) {
		return this.authService.me(currentUser);
	}

	@UseGuards(JwtAuthGuard)
	@Put('me')
	async updateMe(
		@Body() payload: UserUpdateDto,
		@CurrentUser() currentUser?: AuthenticatedUser,
	) {
		return this.authService.updateMe(payload, currentUser);
	}

	@UseGuards(JwtAuthGuard)
	@Put('password')
	async changePassword(
		@Body() payload: PasswordChangeDto,
		@CurrentUser() currentUser?: AuthenticatedUser,
	) {
		return this.authService.changePassword(payload, currentUser);
	}
}
