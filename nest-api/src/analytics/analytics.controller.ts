import {
	Body,
	Controller,
	Get,
	Headers,
	Param,
	ParseIntPipe,
	Post,
	Query,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AnalyticsService } from './analytics.service';
import {
	AnalyticsReportsQueryDto,
	Ga4RunRequestDto,
	LighthouseRunRequestDto,
} from './dto/analytics.dto';

@Controller('analytics')
export class AnalyticsController {
	constructor(
		private readonly analyticsService: AnalyticsService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Post('ga4/run')
	async runGa4Report(
		@Body() payload: Ga4RunRequestDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.analyticsService.runGa4Report(payload, ownerId);
	}

	@Post('lighthouse/run')
	async runLighthouseReport(
		@Body() payload: LighthouseRunRequestDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.analyticsService.runLighthouseReport(payload, ownerId);
	}

	@Get('reports')
	async listReports(
		@Query() query: AnalyticsReportsQueryDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.analyticsService.listReports(query, ownerId);
	}

	@Get('reports/:reportId')
	async getReport(
		@Param('reportId', ParseIntPipe) reportId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.analyticsService.getReport(reportId, ownerId);
	}
}
