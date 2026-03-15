import { Body, Controller, Get, Put } from '@nestjs/common';
import { SSHKeyUpdateRequestDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
	constructor(private readonly settingsService: SettingsService) {}

	@Get('ssh-key')
	async getSystemSSHKey() {
		return this.settingsService.getSystemSSHKey();
	}

	@Put('ssh-key')
	async updateSystemSSHKey(@Body() payload: SSHKeyUpdateRequestDto) {
		return this.settingsService.updateSystemSSHKey(payload.private_key);
	}
}
