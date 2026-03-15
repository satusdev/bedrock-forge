import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { CreatePackageDto, UpdatePackageDto } from './dto/package.dto';
import { PackagesService } from './packages.service';

@Controller('packages')
export class PackagesController {
	constructor(private readonly packagesService: PackagesService) {}

	@Get(['', '/'])
	async listPackages(
		@Query('is_active') isActive?: string,
		@Query('service_type') serviceType?: string,
	) {
		return this.packagesService.listPackages(
			isActive !== undefined ? isActive === 'true' : true,
			serviceType,
		);
	}

	@Get(':packageId')
	async getPackage(@Param('packageId', ParseIntPipe) packageId: number) {
		return this.packagesService.getPackage(packageId);
	}

	@Post(['', '/'])
	async createPackage(@Body() payload: CreatePackageDto) {
		return this.packagesService.createPackage(payload);
	}

	@Put(':packageId')
	async updatePackage(
		@Param('packageId', ParseIntPipe) packageId: number,
		@Body() payload: UpdatePackageDto,
	) {
		return this.packagesService.updatePackage(packageId, payload);
	}

	@Delete(':packageId')
	async deactivatePackage(@Param('packageId', ParseIntPipe) packageId: number) {
		return this.packagesService.deactivatePackage(packageId);
	}
}
