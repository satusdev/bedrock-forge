import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesRunnerService } from './invoices.runner.service';
import { InvoicesService } from './invoices.service';

@Module({
	imports: [PrismaModule],
	controllers: [InvoicesController],
	providers: [InvoicesService, InvoicesRunnerService],
})
export class InvoicesModule {}
