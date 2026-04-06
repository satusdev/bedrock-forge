import {
	Controller,
	Get,
	Put,
	Post,
	Body,
	UseGuards,
	HttpCode,
	HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { ReportsService } from './reports.service';
import { UpdateReportScheduleDto } from './dto/report-schedule.dto';

@Controller('reports')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.ADMIN)
export class ReportsController {
	constructor(private readonly svc: ReportsService) {}

	@Get('config')
	getConfig() {
		return this.svc.getConfig();
	}

	@Put('config')
	updateConfig(@Body() dto: UpdateReportScheduleDto) {
		return this.svc.updateConfig(dto);
	}

	@Post('generate')
	@HttpCode(HttpStatus.ACCEPTED)
	generateNow() {
		return this.svc.generateNow();
	}
}
