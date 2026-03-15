import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
	let controller: DashboardController;
	let service: jest.Mocked<
		Pick<
			DashboardService,
			| 'getStats'
			| 'getConfig'
			| 'updateConfig'
			| 'updateTheme'
			| 'updateLayout'
			| 'updateNotifications'
			| 'updateWidget'
			| 'getWidget'
			| 'resetConfig'
			| 'exportConfig'
			| 'importConfig'
			| 'health'
		>
	>;

	beforeEach(() => {
		service = {
			getStats: jest.fn(),
			getConfig: jest.fn(),
			updateConfig: jest.fn(),
			updateTheme: jest.fn(),
			updateLayout: jest.fn(),
			updateNotifications: jest.fn(),
			updateWidget: jest.fn(),
			getWidget: jest.fn(),
			resetConfig: jest.fn(),
			exportConfig: jest.fn(),
			importConfig: jest.fn(),
			health: jest.fn(),
		};

		controller = new DashboardController(
			service as unknown as DashboardService,
		);
	});

	it('delegates stats/config/health', async () => {
		service.getStats.mockResolvedValueOnce({ total_projects: 1 } as never);
		service.getConfig.mockReturnValueOnce({ theme: 'system' } as never);
		service.health.mockReturnValueOnce({ status: 'healthy' } as never);

		await controller.getDashboardStats();
		await controller.getDashboardConfig();
		await controller.health();

		expect(service.getStats).toHaveBeenCalled();
		expect(service.getConfig).toHaveBeenCalled();
		expect(service.health).toHaveBeenCalled();
	});
});
