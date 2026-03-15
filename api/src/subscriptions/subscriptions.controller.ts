import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	Param,
	ParseIntPipe,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import {
	CreateSubscriptionDto,
	UpdateSubscriptionDto,
} from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
	constructor(
		private readonly subscriptionsService: SubscriptionsService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get(['', '/'])
	async listSubscriptions(
		@Query('subscription_type') subscriptionType?: string,
		@Query('status') status?: string,
		@Query('client_id') clientId?: string,
		@Query('limit') limit?: string,
		@Query('offset') offset?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.subscriptionsService.listSubscriptions({
			subscription_type: subscriptionType,
			status,
			client_id: clientId ? Number(clientId) : undefined,
			limit: limit ? Number(limit) : undefined,
			offset: offset ? Number(offset) : undefined,
			owner_id: ownerId,
		});
	}

	@Get('expiring')
	async listExpiring(
		@Query('days') days?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.subscriptionsService.listExpiring(
			days ? Number(days) : 30,
			ownerId,
		);
	}

	@Get('stats/summary')
	async getStatsSummary(@Headers('authorization') authorization?: string) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.subscriptionsService.getStatsSummary(ownerId);
	}

	@Get('maintenance/status')
	getMaintenanceStatus() {
		return this.subscriptionsService.getRunnerSnapshot();
	}

	@Get(':subscriptionId')
	async getSubscription(
		@Param('subscriptionId', ParseIntPipe) subscriptionId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.subscriptionsService.getSubscription(subscriptionId, ownerId);
	}

	@Post(['', '/'])
	async createSubscription(
		@Body() payload: CreateSubscriptionDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.subscriptionsService.createSubscription(payload, ownerId);
	}

	@Put(':subscriptionId')
	async updateSubscription(
		@Param('subscriptionId', ParseIntPipe) subscriptionId: number,
		@Body() payload: UpdateSubscriptionDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.subscriptionsService.updateSubscription(
			subscriptionId,
			payload,
			ownerId,
		);
	}

	@Delete(':subscriptionId')
	async cancelSubscription(
		@Param('subscriptionId', ParseIntPipe) subscriptionId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.subscriptionsService.cancelSubscription(
			subscriptionId,
			ownerId,
		);
	}

	@Post(':subscriptionId/renew')
	async renewSubscription(
		@Param('subscriptionId', ParseIntPipe) subscriptionId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.subscriptionsService.renewSubscription(subscriptionId, ownerId);
	}

	@Post(':subscriptionId/invoice')
	async generateRenewalInvoice(
		@Param('subscriptionId', ParseIntPipe) subscriptionId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.subscriptionsService.generateRenewalInvoice(
			subscriptionId,
			ownerId,
		);
	}
}
