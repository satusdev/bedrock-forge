import { Module } from '@nestjs/common';
import { CyberpanelController } from './cyberpanel.controller';
import { CyberpanelService } from './cyberpanel.service';

@Module({
	controllers: [CyberpanelController],
	providers: [CyberpanelService],
})
export class CyberpanelModule {}
