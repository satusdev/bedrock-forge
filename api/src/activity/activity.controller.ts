import { Controller, Get, Query } from '@nestjs/common';
import { ActivityService } from './activity.service';

@Controller('activity')
export class ActivityController {
	constructor(private readonly activityService: ActivityService) {}

	@Get()
	async getActivityFeed(
		@Query('limit') limit?: string,
		@Query('offset') offset?: string,
		@Query('action') action?: string,
		@Query('entity_type') entityType?: string,
		@Query('entity_id') entityId?: string,
		@Query('hours') hours?: string,
	) {
		return this.activityService.getFeed({
			limit: limit ? Number(limit) : undefined,
			offset: offset ? Number(offset) : undefined,
			action,
			entity_type: entityType,
			entity_id: entityId,
			hours: hours ? Number(hours) : undefined,
		});
	}

	@Get('summary')
	async getActivitySummary(@Query('hours') hours?: string) {
		return this.activityService.getSummary(hours ? Number(hours) : 24);
	}
}
