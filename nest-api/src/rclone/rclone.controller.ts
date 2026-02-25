import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import {
	RcloneAuthorizeRequestDto,
	RcloneS3RequestDto,
} from './dto/rclone.dto';
import { RcloneService } from './rclone.service';

@Controller('rclone')
export class RcloneController {
	constructor(private readonly rcloneService: RcloneService) {}

	@Get('remotes')
	async listRemotes() {
		return this.rcloneService.listRemotes();
	}

	@Post('authorize')
	async authorize(@Body() payload: RcloneAuthorizeRequestDto) {
		return this.rcloneService.authorize(payload);
	}

	@Post('remotes/s3')
	async configureS3Remote(@Body() payload: RcloneS3RequestDto) {
		return this.rcloneService.configureS3Remote(payload);
	}

	@Delete('remotes/:remoteName')
	async deleteRemote(@Param('remoteName') remoteName: string) {
		return this.rcloneService.deleteRemote(remoteName);
	}

	@Get('install-instructions')
	getInstallInstructions() {
		return this.rcloneService.getInstallInstructions();
	}
}
