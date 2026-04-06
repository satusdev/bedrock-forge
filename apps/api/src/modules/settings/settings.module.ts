import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SettingsRepository } from './settings.repository';
import { EncryptionModule } from '../../common/encryption/encryption.module';

@Module({
	imports: [EncryptionModule],
	controllers: [SettingsController],
	providers: [SettingsService, SettingsRepository],
	exports: [SettingsService],
})
export class SettingsModule {}
