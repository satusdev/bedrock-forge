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
import { TagsService } from './tags.service';
import { CreateTagDto, UpdateTagDto } from './dto/tag.dto';

@Controller('tags')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class TagsController {
	constructor(private readonly svc: TagsService) {}

	@Get()
	findAll() {
		return this.svc.findAll();
	}

	@Get(':id')
	findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOne(id);
	}

	@Post()
	@Roles(ROLES.ADMIN)
	create(@Body() dto: CreateTagDto) {
		return this.svc.create(dto);
	}

	@Put(':id')
	@Roles(ROLES.ADMIN)
	update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTagDto) {
		return this.svc.update(id, dto);
	}

	@Delete(':id')
	@Roles(ROLES.ADMIN)
	@HttpCode(HttpStatus.NO_CONTENT)
	remove(@Param('id', ParseIntPipe) id: number) {
		return this.svc.remove(id);
	}
}
