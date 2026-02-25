import { MonitorsController } from './monitors.controller';
import { MonitorsService } from './monitors.service';
import { AuthService } from '../auth/auth.service';

describe('MonitorsController', () => {
	let controller: MonitorsController;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;
	let service: jest.Mocked<
		Pick<
			MonitorsService,
			| 'listMonitors'
			| 'listByProject'
			| 'getOverview'
			| 'createMonitor'
			| 'getMonitor'
			| 'updateMonitor'
			| 'deleteMonitor'
			| 'pauseMonitor'
			| 'resumeMonitor'
			| 'togglePause'
			| 'triggerCheck'
			| 'getHistory'
			| 'checkSsl'
			| 'getAlerts'
			| 'updateAlerts'
		>
	>;

	beforeEach(() => {
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest
				.fn()
				.mockResolvedValue(undefined),
		};

		service = {
			listMonitors: jest.fn(),
			listByProject: jest.fn(),
			getOverview: jest.fn(),
			createMonitor: jest.fn(),
			getMonitor: jest.fn(),
			updateMonitor: jest.fn(),
			deleteMonitor: jest.fn(),
			pauseMonitor: jest.fn(),
			resumeMonitor: jest.fn(),
			togglePause: jest.fn(),
			triggerCheck: jest.fn(),
			getHistory: jest.fn(),
			checkSsl: jest.fn(),
			getAlerts: jest.fn(),
			updateAlerts: jest.fn(),
		};
		controller = new MonitorsController(
			service as unknown as MonitorsService,
			authService as unknown as AuthService,
		);
	});

	it('delegates monitor routes', async () => {
		service.listMonitors.mockResolvedValueOnce([]);
		service.listByProject.mockResolvedValueOnce([]);
		service.getOverview.mockResolvedValueOnce({ total: 0 } as never);
		service.createMonitor.mockResolvedValueOnce({ id: 1 } as never);
		service.getMonitor.mockResolvedValueOnce({ id: 1 } as never);
		service.updateMonitor.mockResolvedValueOnce({ id: 1 } as never);
		service.deleteMonitor.mockResolvedValueOnce(undefined);
		service.pauseMonitor.mockResolvedValueOnce({ is_active: false } as never);
		service.resumeMonitor.mockResolvedValueOnce({ is_active: true } as never);
		service.triggerCheck.mockResolvedValueOnce({ status: 'accepted' } as never);
		service.getHistory.mockResolvedValueOnce({ checks: [] } as never);
		service.checkSsl.mockResolvedValueOnce({ valid: true } as never);
		service.getAlerts.mockResolvedValueOnce({ alert_config: {} } as never);
		service.updateAlerts.mockResolvedValueOnce({ status: 'success' } as never);

		await controller.listMonitors('0', '20');
		await controller.listMonitorsByProject(2);
		await controller.getOverview();
		await controller.createMonitor({ name: 'Site', url: 'https://acme.test' });
		await controller.getMonitor(1);
		await controller.updateMonitor(1, { name: 'Updated' });
		await controller.deleteMonitor(1);
		await controller.pauseMonitor(1);
		await controller.resumeMonitor(1);
		await controller.triggerCheck(1);
		await controller.getHistory(1, '48');
		await controller.checkSsl(1);
		await controller.getAlerts(1);
		await controller.updateAlerts(1, { alert_on_down: true });

		expect(service.listMonitors).toHaveBeenCalledWith(0, 20, undefined);
		expect(service.listByProject).toHaveBeenCalledWith(2, undefined);
		expect(service.getOverview).toHaveBeenCalledWith(undefined);
		expect(service.createMonitor).toHaveBeenCalledWith(
			{
				name: 'Site',
				url: 'https://acme.test',
			},
			undefined,
		);
		expect(service.getMonitor).toHaveBeenCalledWith(1, undefined);
		expect(service.updateMonitor).toHaveBeenCalledWith(
			1,
			{ name: 'Updated' },
			undefined,
		);
		expect(service.deleteMonitor).toHaveBeenCalledWith(1, undefined);
		expect(service.pauseMonitor).toHaveBeenCalledWith(1, undefined);
		expect(service.resumeMonitor).toHaveBeenCalledWith(1, undefined);
		expect(service.triggerCheck).toHaveBeenCalledWith(1, undefined);
		expect(service.getHistory).toHaveBeenCalledWith(1, 48, undefined);
		expect(service.checkSsl).toHaveBeenCalledWith(1, undefined);
		expect(service.getAlerts).toHaveBeenCalledWith(1, undefined);
		expect(service.updateAlerts).toHaveBeenCalledWith(
			1,
			{
				alert_on_down: true,
			},
			undefined,
		);
	});
});
