import {
	Controller,
	Get,
	Put,
	Delete,
	Param,
	Body,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { SettingsService } from './settings.service';
import { IsString } from 'class-validator';

class SetSettingDto {
	@IsString() value!: string;
}

@Controller('settings')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.ADMIN)
export class SettingsController {
	constructor(private readonly svc: SettingsService) {}

	@Get() getAll() {
		return this.svc.getAll();
	}
	@Get(':key') get(@Param('key') key: string) {
		return this.svc.get(key);
	}
	@Put(':key') set(@Param('key') key: string, @Body() dto: SetSettingDto) {
		return this.svc.set(key, dto.value);
	}
	@Delete(':key') delete(@Param('key') key: string) {
		return this.svc.delete(key);
	}
}
