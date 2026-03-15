import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

describe('ActivityController', () => {
	let controller: ActivityController;
	let service: jest.Mocked<Pick<ActivityService, 'getFeed' | 'getSummary'>>;

	beforeEach(() => {
		service = {
			getFeed: jest.fn(),
			getSummary: jest.fn(),
		};

		controller = new ActivityController(service as unknown as ActivityService);
	});

	it('delegates feed and summary requests', async () => {
		service.getFeed.mockResolvedValueOnce({ items: [], total: 0 } as never);
		service.getSummary.mockResolvedValueOnce({ total_activities: 0 } as never);

		await controller.getActivityFeed('10', '0', 'create', 'project', '1', '24');
		await controller.getActivitySummary('24');

		expect(service.getFeed).toHaveBeenCalledWith({
			limit: 10,
			offset: 0,
			action: 'create',
			entity_type: 'project',
			entity_id: '1',
			hours: 24,
		});
		expect(service.getSummary).toHaveBeenCalledWith(24);
	});
});
