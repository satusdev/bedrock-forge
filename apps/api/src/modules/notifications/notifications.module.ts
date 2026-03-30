import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { EncryptionModule } from '../../common/encryption/encryption.module';
import { QUEUES } from '@bedrock-forge/shared';

@Module({
	imports: [
		EncryptionModule,
		BullModule.registerQueue({ name: QUEUES.NOTIFICATIONS }),
	],
	controllers: [NotificationsController],
	providers: [NotificationsService, NotificationsRepository],
	exports: [NotificationsService],
})
export class NotificationsModule {}
