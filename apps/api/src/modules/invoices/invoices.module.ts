import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoicesRepository } from './invoices.repository';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
	imports: [NotificationsModule],
	controllers: [InvoicesController],
	providers: [InvoicesService, InvoicesRepository],
	exports: [InvoicesService],
})
export class InvoicesModule {}
