import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ImportProjectsController } from './import-projects.controller';
import { ImportProjectsService } from './import-projects.service';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [ImportProjectsController],
	providers: [ImportProjectsService],
})
export class ImportProjectsModule {}
