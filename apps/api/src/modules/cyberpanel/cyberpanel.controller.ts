import {
	Controller,
	Get,
	Param,
	ParseIntPipe,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { CyberpanelService } from './cyberpanel.service';

@Controller('environments/:envId/cyberpanel')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class CyberpanelController {
	constructor(private readonly svc: CyberpanelService) {}

	/** Returns decrypted cyberpanel credentials for the environment */
	@Get('credentials')
	getCredentials(@Param('envId', ParseIntPipe) envId: number) {
		return this.svc.getCredentials(envId);
	}
}
