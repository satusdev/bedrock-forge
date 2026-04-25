import {
	Controller,
	Get,
	Post,
	Delete,
	Param,
	ParseIntPipe,
	UseGuards,
	HttpCode,
	HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { EnvironmentsService } from './environments.service';

/**
 * Flat, non-nested routes for environments by ID.
 * Required so shared resources (backups, tools, drift) work without project context.
 */
@Controller('environments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class EnvironmentsListController {
	constructor(private readonly svc: EnvironmentsService) {}

	@Get()
	findAll() {
		return this.svc.findAll();
	}

	@Get(':id/php-info')
	getPhpInfo(@Param('id', ParseIntPipe) id: number) {
		return this.svc.getPhpInfo(id);
	}

	@Get(':id/tags')
	listTags(@Param('id', ParseIntPipe) id: number) {
		return this.svc.listTags(id);
	}

	@Post(':id/tags/:tagId')
	addTag(
		@Param('id', ParseIntPipe) id: number,
		@Param('tagId', ParseIntPipe) tagId: number,
	) {
		return this.svc.addTag(id, tagId);
	}

	@Delete(':id/tags/:tagId')
	@HttpCode(HttpStatus.NO_CONTENT)
	removeTag(
		@Param('id', ParseIntPipe) id: number,
		@Param('tagId', ParseIntPipe) tagId: number,
	) {
		return this.svc.removeTag(id, tagId);
	}
}
