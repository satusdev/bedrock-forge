import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AuthService } from '../auth/auth.service';

describe('AnalyticsController', () => {
	let controller: AnalyticsController;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;
	let service: jest.Mocked<
		Pick<
			AnalyticsService,
			'runGa4Report' | 'runLighthouseReport' | 'listReports' | 'getReport'
		>
	>;

	beforeEach(() => {
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest
				.fn()
				.mockResolvedValue(undefined),
		};

		service = {
			runGa4Report: jest.fn(),
			runLighthouseReport: jest.fn(),
			listReports: jest.fn(),
			getReport: jest.fn(),
		};

		controller = new AnalyticsController(
			service as unknown as AnalyticsService,
			authService as unknown as AuthService,
		);
	});

	it('delegates GA4 and Lighthouse runs', async () => {
		service.runGa4Report.mockResolvedValueOnce({ id: 1 } as never);
		service.runLighthouseReport.mockResolvedValueOnce({ id: 2 } as never);

		await controller.runGa4Report({ project_id: 1, days: 14 });
		await controller.runLighthouseReport({ project_id: 1, device: 'mobile' });

		expect(service.runGa4Report).toHaveBeenCalledWith(
			{
				project_id: 1,
				days: 14,
			},
			undefined,
		);
		expect(service.runLighthouseReport).toHaveBeenCalledWith(
			{
				project_id: 1,
				device: 'mobile',
			},
			undefined,
		);
	});

	it('delegates reports queries', async () => {
		service.listReports.mockResolvedValueOnce({ items: [], count: 0 } as never);
		service.getReport.mockResolvedValueOnce({ id: 9 } as never);

		await controller.listReports({ project_id: 1 });
		await controller.getReport(9);

		expect(service.listReports).toHaveBeenCalledWith(
			{ project_id: 1 },
			undefined,
		);
		expect(service.getReport).toHaveBeenCalledWith(9, undefined);
	});
});
