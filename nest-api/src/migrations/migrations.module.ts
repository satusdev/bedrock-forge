import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MigrationsController } from './migrations.controller';
import { MigrationsService } from './migrations.service';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [MigrationsController],
	providers: [MigrationsService],
})
export class MigrationsModule {}
