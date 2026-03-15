import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesRunnerService } from './invoices.runner.service';
import { InvoicesService } from './invoices.service';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [InvoicesController],
	providers: [InvoicesService, InvoicesRunnerService],
})
export class InvoicesModule {}
