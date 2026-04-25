import {
	Controller,
	Get,
	Post,
	Put,
	Delete,
	Body,
	Param,
	ParseIntPipe,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { CustomPluginsService } from './custom-plugins.service';
import { CreateCustomPluginDto } from './dto/create-custom-plugin.dto';
import { UpdateCustomPluginDto } from './dto/update-custom-plugin.dto';

@Controller('custom-plugins')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class CustomPluginsController {
	constructor(private readonly svc: CustomPluginsService) {}

	@Get()
	findAll() {
		return this.svc.findAll();
	}

	@Get(':id')
	findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findById(id);
	}

	@Post()
	create(@Body() dto: CreateCustomPluginDto) {
		return this.svc.create(dto);
	}

	@Put(':id')
	update(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: UpdateCustomPluginDto,
	) {
		return this.svc.update(id, dto);
	}

	@Delete(':id')
	remove(@Param('id', ParseIntPipe) id: number) {
		return this.svc.delete(id);
	}
}
