import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsRunnerService } from './subscriptions.runner.service';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [SubscriptionsController],
	providers: [SubscriptionsService, SubscriptionsRunnerService],
})
export class SubscriptionsModule {}
