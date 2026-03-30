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
import { DomainsService } from './domains.service';
import { CreateDomainDto, UpdateDomainDto, DomainQueryDto } from './dto/domain.dto';

@Controller('domains')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class DomainsController {
	constructor(private readonly svc: DomainsService) {}

	@Get() findAll(@Query() q: DomainQueryDto) {
		return this.svc.findAll(q);
	}
	@Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOne(id);
	}
	@Post() create(@Body() dto: CreateDomainDto) {
		return this.svc.create(dto);
	}
	@Put(':id') update(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: UpdateDomainDto,
	) {
		return this.svc.update(id, dto);
	}
	@Delete(':id') @Roles(ROLES.ADMIN) @HttpCode(HttpStatus.NO_CONTENT) remove(
		@Param('id', ParseIntPipe) id: number,
	) {
		return this.svc.remove(id);
	}
	@Post(':id/whois-refresh') refreshWhois(
		@Param('id', ParseIntPipe) id: number,
	) {
		return this.svc.refreshWhois(id);
	}
}
