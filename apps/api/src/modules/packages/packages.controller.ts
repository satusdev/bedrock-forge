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
import { PackagesService } from './packages.service';
import {
	CreateHostingPackageDto,
	UpdateHostingPackageDto,
	CreateSupportPackageDto,
	UpdateSupportPackageDto,
} from './dto/package.dto';

@Controller('packages')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class PackagesController {
	constructor(private readonly svc: PackagesService) {}

	@Get('hosting') findAllHosting() {
		return this.svc.findAllHosting();
	}
	@Get('hosting/:id') findOneHosting(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOneHosting(id);
	}
	@Post('hosting') createHosting(@Body() dto: CreateHostingPackageDto) {
		return this.svc.createHosting(dto);
	}
	@Put('hosting/:id') updateHosting(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: UpdateHostingPackageDto,
	) {
		return this.svc.updateHosting(id, dto);
	}
	@Delete('hosting/:id') @HttpCode(HttpStatus.NO_CONTENT) removeHosting(
		@Param('id', ParseIntPipe) id: number,
	) {
		return this.svc.removeHosting(id);
	}

	@Get('support') findAllSupport() {
		return this.svc.findAllSupport();
	}
	@Get('support/:id') findOneSupport(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOneSupport(id);
	}
	@Post('support') createSupport(@Body() dto: CreateSupportPackageDto) {
		return this.svc.createSupport(dto);
	}
	@Put('support/:id') updateSupport(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: UpdateSupportPackageDto,
	) {
		return this.svc.updateSupport(id, dto);
	}
	@Delete('support/:id') @HttpCode(HttpStatus.NO_CONTENT) removeSupport(
		@Param('id', ParseIntPipe) id: number,
	) {
		return this.svc.removeSupport(id);
	}
}
