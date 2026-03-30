import { Module } from '@nestjs/common';
import { CyberpanelController } from './cyberpanel.controller';
import { CyberpanelService } from './cyberpanel.service';
import { CyberpanelRepository } from './cyberpanel.repository';

@Module({
	controllers: [CyberpanelController],
	providers: [CyberpanelService, CyberpanelRepository],
})
export class CyberpanelModule {}
