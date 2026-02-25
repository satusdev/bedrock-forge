import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from './authenticated-user';

export const CurrentUser = createParamDecorator(
	(_: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
		const request = context
			.switchToHttp()
			.getRequest<{ user?: AuthenticatedUser }>();
		return request.user;
	},
);
