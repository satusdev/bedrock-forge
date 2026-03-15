import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PromoteRequestDto } from './dto/promote-request.dto';
import { RollbackRequestDto } from './dto/rollback-request.dto';
import { DeploymentsService } from './deployments.service';

@Controller('deployments')
export class DeploymentsController {
	constructor(private readonly deploymentsService: DeploymentsService) {}

	@Post('promote')
	async promote(@Body() payload: PromoteRequestDto) {
		return this.deploymentsService.promote(payload);
	}

	@Get('history')
	async history() {
		return this.deploymentsService.getHistory();
	}

	@Post(':projectName/rollback')
	async rollback(
		@Param('projectName') projectName: string,
		@Body() payload: RollbackRequestDto,
	) {
		return this.deploymentsService.rollback(projectName, payload);
	}
}
