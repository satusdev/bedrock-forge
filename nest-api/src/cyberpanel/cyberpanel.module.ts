import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CyberpanelController } from './cyberpanel.controller';
import { CyberpanelService } from './cyberpanel.service';

@Module({
	imports: [PrismaModule],
	controllers: [CyberpanelController],
	providers: [CyberpanelService],
})
export class CyberpanelModule {}
