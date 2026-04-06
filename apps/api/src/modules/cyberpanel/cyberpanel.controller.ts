import {
	Controller,
	Get,
	Put,
	Param,
	Body,
	ParseIntPipe,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { CyberpanelService } from './cyberpanel.service';
import { UpsertCyberpanelDto } from './dto/cyberpanel.dto';

@Controller('servers/:serverId/cyberpanel')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class CyberpanelController {
	constructor(private readonly svc: CyberpanelService) {}

	/** Returns decrypted cyberpanel credentials for the server */
	@Get('credentials')
	getCredentials(@Param('serverId', ParseIntPipe) serverId: number) {
		return this.svc.getCredentials(serverId);
	}

	/** Create or update cyberpanel credentials for the server */
	@Put('credentials')
	saveCredentials(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Body() dto: UpsertCyberpanelDto,
	) {
		return this.svc.saveCredentials(serverId, dto);
	}
}
