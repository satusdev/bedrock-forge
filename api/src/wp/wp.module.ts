import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WpController } from './wp.controller';
import { WpRepository } from './wp.repository';
import { WpRunnerService } from './wp-runner.service';
import { WpService } from './wp.service';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [WpController],
	providers: [WpService, WpRepository, WpRunnerService],
})
export class WpModule {}
