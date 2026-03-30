import {
	Controller,
	Post,
	Body,
	HttpCode,
	HttpStatus,
	UseGuards,
	Get,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RefreshTokenDto } from './dto/auth.dto';
import {
	CurrentUser,
	AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('register')
	@Throttle({ default: { ttl: 60_000, limit: 5 } })
	async register(@Body() dto: RegisterDto): Promise<any> {
		return this.authService.register(dto.email, dto.name, dto.password);
	}

	@Post('login')
	@HttpCode(HttpStatus.OK)
	@Throttle({ default: { ttl: 15 * 60_000, limit: 5 } })
	async login(@Body() dto: LoginDto): Promise<any> {
		return this.authService.login(dto.email, dto.password);
	}

	@Post('refresh')
	@HttpCode(HttpStatus.OK)
	async refresh(@Body() dto: RefreshTokenDto): Promise<any> {
		return this.authService.refresh(dto.refreshToken);
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

	@Get('me')
	@UseGuards(AuthGuard('jwt'))
	me(@CurrentUser() user: AuthenticatedUser) {
		return user;
	}
}
