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
import { ServersService } from './servers.service';
import { CreateServerDto, UpdateServerDto } from './dto/server.dto';

@Controller('servers')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class ServersController {
	constructor(private readonly svc: ServersService) {}

	@Get() findAll() {
		return this.svc.findAll();
	}
	@Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOne(id);
	}
	@Post() create(@Body() dto: CreateServerDto) {
		return this.svc.create(dto);
	}
	@Put(':id') update(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: UpdateServerDto,
	) {
		return this.svc.update(id, dto);
	}
	@Delete(':id') @Roles(ROLES.ADMIN) @HttpCode(HttpStatus.NO_CONTENT) remove(
		@Param('id', ParseIntPipe) id: number,
	) {
		return this.svc.remove(id);
	}
	@Post(':id/test-connection') testConnection(
		@Param('id', ParseIntPipe) id: number,
	) {
		return this.svc.testConnection(id);
	}
}
