import {
	Injectable,
	CanActivate,
	ExecutionContext,
	ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role, ROLE_HIERARCHY } from '@bedrock-forge/shared';

@Injectable()
export class RolesGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
			context.getHandler(),
			context.getClass(),
		]);

		if (!requiredRoles || requiredRoles.length === 0) {
			return true;
		}

		const { user } = context.switchToHttp().getRequest();
		if (!user) throw new ForbiddenException('Not authenticated');

		const userRoles: Role[] = user.roles ?? [];
		const maxUserLevel = Math.max(
			0,
			...userRoles.map(r => ROLE_HIERARCHY[r] ?? 0),
		);

		const minRequired = Math.min(
			...requiredRoles.map(r => ROLE_HIERARCHY[r] ?? 0),
		);

		if (maxUserLevel < minRequired) {
			throw new ForbiddenException('Insufficient permissions');
		}

		return true;
	}
}
