import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudflareController } from './cloudflare.controller';
import { CloudflareService } from './cloudflare.service';

@Module({
	imports: [PrismaModule],
	controllers: [CloudflareController],
	providers: [CloudflareService],
})
export class CloudflareModule {}
