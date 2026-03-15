import { Controller, Get, Query } from '@nestjs/common';
import { GdriveService } from './gdrive.service';

type DriveFoldersQuery = {
	query?: string;
	path?: string;
	shared_with_me?: string;
	max_results?: string;
};

@Controller('gdrive')
export class GdriveController {
	constructor(private readonly gdriveService: GdriveService) {}

	@Get('status')
	async getStatus() {
		return this.gdriveService.getStatus();
	}

	@Get('storage')
	async getStorage() {
		return this.gdriveService.getStorageUsage();
	}

	@Get('folders')
	async listFolders(@Query() query: DriveFoldersQuery) {
		return this.gdriveService.listFolders({
			query: query.query,
			path: query.path,
			shared_with_me:
				query.shared_with_me === undefined
					? true
					: query.shared_with_me === 'true',
			max_results: query.max_results
				? Number.parseInt(query.max_results, 10)
				: 200,
		});
	}
}
