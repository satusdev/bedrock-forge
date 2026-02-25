import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import {
	DriveCloneRequestDto,
	UrlReplaceRequestDto,
} from './dto/migrations.dto';
import { MigrationsService } from './migrations.service';

@Controller('migrations')
export class MigrationsController {
	constructor(
		private readonly migrationsService: MigrationsService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Post('url-replace')
	@HttpCode(202)
	async migrateUrlReplace(
		@Body() payload: UrlReplaceRequestDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.migrationsService.migrateUrlReplace(payload, ownerId);
	}

	@Post('drive/clone')
	@HttpCode(202)
	async cloneFromDrive(
		@Body() payload: DriveCloneRequestDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.migrationsService.cloneFromDrive(payload, ownerId);
	}
}
