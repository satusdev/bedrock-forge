import { Module } from '@nestjs/common';
import { PackagesController } from './packages.controller';
import { PackagesRepository } from './packages.repository';
import { PackagesService } from './packages.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
	imports: [PrismaModule],
	controllers: [PackagesController],
	providers: [PackagesService, PackagesRepository],
})
export class PackagesModule {}
