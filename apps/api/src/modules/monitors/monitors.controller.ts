import {
	Controller,
	Get,
	Post,
	Put,
	Delete,
	Param,
	Body,
	ParseIntPipe,
	UseGuards,
	HttpCode,
	HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { MonitorsService } from './monitors.service';
import { CreateMonitorDto, UpdateMonitorDto } from './dto/monitor.dto';

@Controller('monitors')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class MonitorsController {
	constructor(private readonly svc: MonitorsService) {}

	@Get() findAll() {
		return this.svc.findAll();
	}
	@Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOne(id);
	}
	@Post() create(@Body() dto: CreateMonitorDto) {
		return this.svc.create(dto);
	}
	@Put(':id') update(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: UpdateMonitorDto,
	) {
		return this.svc.update(id, dto);
	}
	@Delete(':id') @Roles(ROLES.ADMIN) @HttpCode(HttpStatus.NO_CONTENT) remove(
		@Param('id', ParseIntPipe) id: number,
	) {
		return this.svc.remove(id);
	}
	@Put(':id/activate') activate(@Param('id', ParseIntPipe) id: number) {
		return this.svc.toggle(id, true);
	}
	@Put(':id/deactivate') deactivate(@Param('id', ParseIntPipe) id: number) {
		return this.svc.toggle(id, false);
	}
}
