import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
	constructor(private readonly svc: DashboardService) {}

	@Get('summary')
	getSummary() {
		return this.svc.getSummary();
	}

	@Get('health-scores')
	getHealthScores() {
		return this.svc.getHealthScores();
	}

	@Get('attention')
	getAttention() {
		return this.svc.getAttentionItems();
	}

	@Get('summary-24h')
	get24hSummary() {
		return this.svc.get24hSummary();
	}}