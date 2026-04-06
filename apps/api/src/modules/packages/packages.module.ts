import { Module } from '@nestjs/common';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';
import { PackagesRepository } from './packages.repository';

@Module({
	controllers: [PackagesController],
	providers: [PackagesService, PackagesRepository],
	exports: [PackagesService],
})
export class PackagesModule {}
