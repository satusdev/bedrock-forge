import {
	Body,
	Controller,
	Get,
	Headers,
	Post,
	Query,
	UnauthorizedException,
} from '@nestjs/common';
import { ClientAuthService } from './client-auth.service';
import { ClientLoginDto } from './dto/client-login.dto';

@Controller('client/auth')
export class ClientAuthController {
	constructor(private readonly clientAuthService: ClientAuthService) {}

	@Post('login')
	async login(@Body() payload: ClientLoginDto) {
		return this.clientAuthService.login(payload);
	}

	@Get('me')
	async me(
		@Query('token') token?: string,
		@Headers('authorization') authorization?: string,
	) {
		const resolvedToken =
			token ??
			(authorization?.startsWith('Bearer ')
				? authorization.replace('Bearer ', '')
				: undefined);

		if (!resolvedToken) {
			throw new UnauthorizedException({ detail: 'Missing credentials' });
		}

		return this.clientAuthService.me(resolvedToken);
	}

	@Post('refresh')
	async refresh(@Headers('authorization') authorization?: string) {
		if (!authorization || !authorization.startsWith('Bearer ')) {
			throw new UnauthorizedException({ detail: 'Missing credentials' });
		}

		const token = authorization.replace('Bearer ', '');
		return this.clientAuthService.refresh(token);
	}

	@Post('logout')
	async logout() {
		return { message: 'Logged out successfully' };
	}
}
