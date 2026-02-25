import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	HttpCode,
	Param,
	ParseIntPipe,
	Post,
	Put,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { CredentialsService } from './credentials.service';

@Controller('credentials')
export class CredentialsController {
	constructor(
		private readonly credentialsService: CredentialsService,
		private readonly authService: AuthService,
	) {}

	@Get(':projectServerId/credentials')
	async listCredentials(
		@Param('projectServerId', ParseIntPipe) projectServerId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId =
			await this.authService.resolveOptionalUserIdFromAuthorizationHeader(
				authorization,
			);
		return this.credentialsService.listCredentials(projectServerId, ownerId);
	}

	@Post(':projectServerId/credentials')
	async createCredential(
		@Param('projectServerId', ParseIntPipe) projectServerId: number,
		@Body()
		payload: {
			label?: string;
			username: string;
			password: string;
			notes?: string;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId =
			await this.authService.resolveOptionalUserIdFromAuthorizationHeader(
				authorization,
			);
		return this.credentialsService.createCredential(
			projectServerId,
			payload,
			ownerId,
		);
	}

	@Get(':projectServerId/credentials/:credentialId')
	async getCredential(
		@Param('projectServerId', ParseIntPipe) projectServerId: number,
		@Param('credentialId', ParseIntPipe) credentialId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId =
			await this.authService.resolveOptionalUserIdFromAuthorizationHeader(
				authorization,
			);
		return this.credentialsService.getCredential(
			projectServerId,
			credentialId,
			ownerId,
		);
	}

	@Put(':projectServerId/credentials/:credentialId')
	async updateCredential(
		@Param('projectServerId', ParseIntPipe) projectServerId: number,
		@Param('credentialId', ParseIntPipe) credentialId: number,
		@Body()
		payload: {
			label?: string;
			username?: string;
			password?: string;
			notes?: string;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId =
			await this.authService.resolveOptionalUserIdFromAuthorizationHeader(
				authorization,
			);
		return this.credentialsService.updateCredential(
			projectServerId,
			credentialId,
			payload,
			ownerId,
		);
	}

	@Delete(':projectServerId/credentials/:credentialId')
	@HttpCode(204)
	async deleteCredential(
		@Param('projectServerId', ParseIntPipe) projectServerId: number,
		@Param('credentialId', ParseIntPipe) credentialId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId =
			await this.authService.resolveOptionalUserIdFromAuthorizationHeader(
				authorization,
			);
		await this.credentialsService.deleteCredential(
			projectServerId,
			credentialId,
			ownerId,
		);
	}

	@Post(':projectServerId/credentials/:credentialId/quick-login')
	async generateQuickLogin(
		@Param('projectServerId', ParseIntPipe) projectServerId: number,
		@Param('credentialId', ParseIntPipe) credentialId: number,
		@Body() payload: { method?: string; duration_minutes?: number },
		@Headers('authorization') authorization?: string,
	) {
		const ownerId =
			await this.authService.resolveOptionalUserIdFromAuthorizationHeader(
				authorization,
			);
		return this.credentialsService.generateQuickLogin(
			projectServerId,
			credentialId,
			payload,
			ownerId,
		);
	}

	@Get('quick-login/:token')
	async validateQuickLoginToken(@Param('token') token: string) {
		return this.credentialsService.validateQuickLoginToken(token);
	}

	@Post('quick-login/:token/validate')
	async validateAutologinToken(@Param('token') token: string) {
		return this.credentialsService.validateAutologinToken(token);
	}
}
