import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './authenticated-user';

@Injectable()
export class JwtAuthGuard implements CanActivate {
	constructor(private readonly authService: AuthService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<{
			headers?: Record<string, string | string[] | undefined>;
			user?: AuthenticatedUser;
		}>();
		const authorizationHeader = request.headers?.authorization;
		const resolvedHeader = Array.isArray(authorizationHeader)
			? authorizationHeader[0]
			: authorizationHeader;

		request.user =
			await this.authService.resolveRequiredUserFromAuthorizationHeader(
				resolvedHeader,
			);
		if (!request.user) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		return true;
	}
}
