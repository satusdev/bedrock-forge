import {
	Body,
	Controller,
	Get,
	Headers,
	Param,
	ParseIntPipe,
	Post,
	Put,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import {
	PluginPolicyBaseDto,
	ProjectPolicyUpdateDto,
} from './dto/plugin-policy-base.dto';
import { PluginPoliciesService } from './plugin-policies.service';

@Controller('plugin-policies')
export class PluginPoliciesController {
	constructor(
		private readonly pluginPoliciesService: PluginPoliciesService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get('global')
	async getGlobalPolicy(@Headers('authorization') authorization?: string) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.pluginPoliciesService.getGlobalPolicy(ownerId);
	}

	@Put('global')
	async updateGlobalPolicy(
		@Body() payload: PluginPolicyBaseDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.pluginPoliciesService.updateGlobalPolicy(payload, ownerId);
	}

	@Get('projects/:projectId')
	async getProjectPolicy(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.pluginPoliciesService.getProjectPolicy(projectId, ownerId);
	}

	@Put('projects/:projectId')
	async upsertProjectPolicy(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Body() payload: ProjectPolicyUpdateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.pluginPoliciesService.upsertProjectPolicy(
			projectId,
			payload,
			ownerId,
		);
	}

	@Get('projects/:projectId/effective')
	async getEffectivePolicy(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.pluginPoliciesService.getEffectivePolicy(projectId, ownerId);
	}

	@Get('bundles')
	async listBundles() {
		return this.pluginPoliciesService.listBundles();
	}

	@Post('global/bundles/:bundleId')
	async applyBundleToGlobalPolicy(
		@Param('bundleId') bundleId: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.pluginPoliciesService.applyBundleToGlobalPolicy(
			bundleId,
			ownerId,
		);
	}

	@Post('projects/:projectId/bundles/:bundleId')
	async applyBundleToProjectPolicy(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Param('bundleId') bundleId: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.pluginPoliciesService.applyBundleToProjectPolicy(
			projectId,
			bundleId,
			ownerId,
		);
	}

	@Get('project-servers/:projectServerId/drift')
	async getPluginDrift(
		@Param('projectServerId', ParseIntPipe) projectServerId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.pluginPoliciesService.getPluginDrift(projectServerId, ownerId);
	}
}
