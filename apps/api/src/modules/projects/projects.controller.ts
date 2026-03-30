import {
	Controller,
	Get,
	Post,
	Put,
	Delete,
	Param,
	Body,
	Query,
	ParseIntPipe,
	UseGuards,
	HttpCode,
	HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { ImportProjectDto } from './dto/import-project.dto';
import { BulkImportProjectsDto } from './dto/bulk-import-projects.dto';

@Controller('projects')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class ProjectsController {
	constructor(private readonly svc: ProjectsService) {}

	@Get() findAll(@Query() q: PaginationQueryDto) {
		return this.svc.findAll(q);
	}
	@Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOne(id);
	}
	@Post() create(@Body() dto: CreateProjectDto) {
		return this.svc.create(dto);
	}
	@Put(':id') update(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: UpdateProjectDto,
	) {
		return this.svc.update(id, dto);
	}
	@Delete(':id') @Roles(ROLES.ADMIN) @HttpCode(HttpStatus.NO_CONTENT) remove(
		@Param('id', ParseIntPipe) id: number,
	) {
		return this.svc.remove(id);
	}
	@Post('import') @HttpCode(HttpStatus.CREATED) importFromServer(
		@Body() dto: ImportProjectDto,
	) {
		return this.svc.importFromServer(dto);
	}
	@Post('import-bulk') @HttpCode(HttpStatus.CREATED) importBulk(
		@Body() dto: BulkImportProjectsDto,
	) {
		return this.svc.importBulk(dto);
	}
}
