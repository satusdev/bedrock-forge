import { BadRequestException } from '@nestjs/common';
import { RcloneService } from './rclone.service';

describe('RcloneService', () => {
	let service: RcloneService;

	beforeEach(() => {
		service = new RcloneService();
	});

	it('rejects malformed authorize payload', async () => {
		await expect(
			service.authorize({
				token: 'not-json',
				remote_name: 'gdrive',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('returns install instructions', () => {
		const instructions = service.getInstallInstructions();
		expect(instructions.instructions.linux).toContain('rclone');
	});
});
