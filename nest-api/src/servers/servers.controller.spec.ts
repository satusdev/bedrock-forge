import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';
import { AuthService } from '../auth/auth.service';

describe('ServersController', () => {
	let controller: ServersController;
	let service: jest.Mocked<
		Pick<
			ServersService,
			| 'listServers'
			| 'createServer'
			| 'getServer'
			| 'updateServer'
			| 'deleteServer'
			| 'testServerConnection'
			| 'getHealth'
			| 'triggerHealthCheck'
			| 'getPanelLoginUrl'
			| 'getPanelSessionUrl'
			| 'getAllTags'
			| 'updateServerTags'
			| 'getServerTags'
			| 'scanSites'
			| 'scanDirectories'
			| 'getDirectories'
			| 'readEnv'
		>
	>;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;

	beforeEach(() => {
		service = {
			listServers: jest.fn(),
			createServer: jest.fn(),
			getServer: jest.fn(),
			updateServer: jest.fn(),
			deleteServer: jest.fn(),
			testServerConnection: jest.fn(),
			getHealth: jest.fn(),
			triggerHealthCheck: jest.fn(),
			getPanelLoginUrl: jest.fn(),
			getPanelSessionUrl: jest.fn(),
			getAllTags: jest.fn(),
			updateServerTags: jest.fn(),
			getServerTags: jest.fn(),
			scanSites: jest.fn(),
			scanDirectories: jest.fn(),
			getDirectories: jest.fn(),
			readEnv: jest.fn(),
		};
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
		};
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		controller = new ServersController(
			service as unknown as ServersService,
			authService as unknown as AuthService,
		);
	});

	it('delegates basic CRUD routes', async () => {
		service.listServers.mockResolvedValueOnce([]);
		service.createServer.mockResolvedValueOnce({ id: 1 } as never);
		service.getServer.mockResolvedValueOnce({ id: 1 } as never);
		service.updateServer.mockResolvedValueOnce({ id: 1 } as never);
		service.deleteServer.mockResolvedValueOnce(undefined);

		await controller.listServers('0', '50', undefined);
		await controller.createServer(
			{ name: 'A', hostname: 'a.test' } as never,
			undefined,
		);
		await controller.getServer(1, undefined);
		await controller.updateServer(1, { name: 'B' } as never, undefined);
		await controller.deleteServer(1, undefined);

		expect(service.listServers).toHaveBeenCalledWith(0, 50, undefined);
		expect(service.createServer).toHaveBeenCalledWith(
			{ name: 'A', hostname: 'a.test' },
			undefined,
		);
		expect(service.getServer).toHaveBeenCalledWith(1, undefined);
		expect(service.updateServer).toHaveBeenCalledWith(
			1,
			{ name: 'B' },
			undefined,
		);
		expect(service.deleteServer).toHaveBeenCalledWith(1, undefined);
	});

	it('delegates utility endpoints', async () => {
		service.testServerConnection.mockResolvedValueOnce({
			success: true,
		} as never);
		service.getHealth.mockResolvedValueOnce({ status: 'online' } as never);
		service.triggerHealthCheck.mockResolvedValueOnce({
			status: 'accepted',
		} as never);
		service.getPanelLoginUrl.mockResolvedValueOnce({} as never);
		service.getPanelSessionUrl.mockResolvedValueOnce({} as never);
		service.getAllTags.mockResolvedValueOnce({ tags: [] });
		service.updateServerTags.mockResolvedValueOnce({ tags: [] } as never);
		service.getServerTags.mockResolvedValueOnce({ tags: [] } as never);
		service.scanSites.mockResolvedValueOnce({ success: true } as never);
		service.scanDirectories.mockResolvedValueOnce({ success: true } as never);
		service.getDirectories.mockResolvedValueOnce({ directories: [] } as never);
		service.readEnv.mockResolvedValueOnce({ success: true } as never);

		await controller.testServerConnection(2, undefined);
		await controller.getHealth(2, undefined);
		await controller.triggerHealthCheck(2, undefined);
		await controller.getPanelLoginUrl(2, undefined);
		await controller.getPanelSessionUrl(2, undefined);
		await controller.getAllTags(undefined);
		await controller.updateServerTags(2, ['prod'], undefined);
		await controller.getServerTags(2, undefined);
		await controller.scanSites(2, '/home', undefined);
		await controller.scanDirectories(2, '/var/www', '4', undefined);
		await controller.getDirectories(2, undefined);
		await controller.readEnv(2, '/var/www/site', undefined);

		expect(service.testServerConnection).toHaveBeenCalledWith(2, undefined);
		expect(service.getHealth).toHaveBeenCalledWith(2, undefined);
		expect(service.triggerHealthCheck).toHaveBeenCalledWith(2, undefined);
		expect(service.getPanelLoginUrl).toHaveBeenCalledWith(2, undefined);
		expect(service.getPanelSessionUrl).toHaveBeenCalledWith(2, undefined);
		expect(service.getAllTags).toHaveBeenCalledWith(undefined);
		expect(service.updateServerTags).toHaveBeenCalledWith(
			2,
			['prod'],
			undefined,
		);
		expect(service.getServerTags).toHaveBeenCalledWith(2, undefined);
		expect(service.scanSites).toHaveBeenCalledWith(2, '/home', undefined);
		expect(service.scanDirectories).toHaveBeenCalledWith(
			2,
			'/var/www',
			4,
			undefined,
		);
		expect(service.getDirectories).toHaveBeenCalledWith(2, undefined);
		expect(service.readEnv).toHaveBeenCalledWith(2, '/var/www/site', undefined);
	});
});
