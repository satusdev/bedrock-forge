import { CyberpanelController } from './cyberpanel.controller';
import { CyberpanelService } from './cyberpanel.service';

describe('CyberpanelController', () => {
	let controller: CyberpanelController;
	let service: jest.Mocked<
		Pick<
			CyberpanelService,
			| 'verify'
			| 'listWebsites'
			| 'createWebsite'
			| 'deleteWebsite'
			| 'listDatabases'
			| 'createDatabase'
			| 'deleteDatabase'
			| 'issueSsl'
			| 'getWebsiteStats'
			| 'changePhpVersion'
			| 'scanWordpressSites'
			| 'getServerInfo'
			| 'listUsers'
			| 'createUser'
			| 'getUser'
			| 'updateUser'
			| 'deleteUser'
			| 'changeUserPassword'
			| 'revealUserPassword'
			| 'suspendUser'
			| 'unsuspendUser'
			| 'listPackages'
			| 'listAcls'
		>
	>;

	beforeEach(() => {
		service = {
			verify: jest.fn(),
			listWebsites: jest.fn(),
			createWebsite: jest.fn(),
			deleteWebsite: jest.fn(),
			listDatabases: jest.fn(),
			createDatabase: jest.fn(),
			deleteDatabase: jest.fn(),
			issueSsl: jest.fn(),
			getWebsiteStats: jest.fn(),
			changePhpVersion: jest.fn(),
			scanWordpressSites: jest.fn(),
			getServerInfo: jest.fn(),
			listUsers: jest.fn(),
			createUser: jest.fn(),
			getUser: jest.fn(),
			updateUser: jest.fn(),
			deleteUser: jest.fn(),
			changeUserPassword: jest.fn(),
			revealUserPassword: jest.fn(),
			suspendUser: jest.fn(),
			unsuspendUser: jest.fn(),
			listPackages: jest.fn(),
			listAcls: jest.fn(),
		};

		controller = new CyberpanelController(
			service as unknown as CyberpanelService,
		);
	});

	it('delegates website/database/ssl operations', async () => {
		service.verify.mockResolvedValueOnce({ verified: true } as never);
		service.listWebsites.mockResolvedValueOnce({ websites: [] } as never);
		service.createWebsite.mockResolvedValueOnce({ status: 'success' } as never);
		service.deleteWebsite.mockResolvedValueOnce({ status: 'success' } as never);
		service.listDatabases.mockResolvedValueOnce({ databases: [] } as never);
		service.createDatabase.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.deleteDatabase.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.issueSsl.mockResolvedValueOnce({ status: 'success' } as never);
		service.getWebsiteStats.mockResolvedValueOnce({ success: true } as never);
		service.changePhpVersion.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.scanWordpressSites.mockResolvedValueOnce({ total: 0 } as never);
		service.getServerInfo.mockResolvedValueOnce({ success: true } as never);
		service.listUsers.mockResolvedValueOnce({ users: [] } as never);
		service.createUser.mockResolvedValueOnce({ status: 'success' } as never);
		service.getUser.mockResolvedValueOnce({ username: 'u1' } as never);
		service.updateUser.mockResolvedValueOnce({ status: 'success' } as never);
		service.deleteUser.mockResolvedValueOnce({ status: 'success' } as never);
		service.changeUserPassword.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.revealUserPassword.mockResolvedValueOnce({
			username: 'u1',
		} as never);
		service.suspendUser.mockResolvedValueOnce({ status: 'success' } as never);
		service.unsuspendUser.mockResolvedValueOnce({ status: 'success' } as never);
		service.listPackages.mockResolvedValueOnce({ total: 1 } as never);
		service.listAcls.mockResolvedValueOnce({ total: 1 } as never);

		await controller.verify(1);
		await controller.listWebsites(1);
		await controller.createWebsite(1, {
			domain: 'site.test',
			email: 'a@b.com',
		});
		await controller.deleteWebsite(1, 'site.test');
		await controller.listDatabases(1);
		await controller.createDatabase(1, {
			domain: 'site.test',
			db_name: 'db1',
			db_user: 'u1',
			db_password: 'password123',
		});
		await controller.deleteDatabase(1, 'db1');
		await controller.issueSsl(1, 'site.test');
		await controller.issueWebsiteSsl(1, 'site.test');
		await controller.getWebsiteStats(1, 'site.test');
		await controller.changePhpVersion(1, 'site.test', { php_version: '8.2' });
		await controller.scanWordpressSites(1);
		await controller.getServerInfo(1);
		await controller.listUsers(1, 'true');
		await controller.createUser(1, { username: 'u1', email: 'u1@test.local' });
		await controller.getUser(1, 'u1');
		await controller.updateUser(1, 'u1', { first_name: 'User' });
		await controller.deleteUser(1, 'u1');
		await controller.changeUserPassword(1, 'u1', {
			new_password: 'secret1234',
		});
		await controller.revealUserPassword(1, 'u1');
		await controller.suspendUser(1, 'u1');
		await controller.unsuspendUser(1, 'u1');
		await controller.listPackages(1);
		await controller.listAcls(1);

		expect(service.verify).toHaveBeenCalledWith(1);
		expect(service.issueSsl).toHaveBeenCalledWith(1, 'site.test');
		expect(service.changePhpVersion).toHaveBeenCalledWith(
			1,
			'site.test',
			'8.2',
		);
		expect(service.listUsers).toHaveBeenCalledWith(1, true);
	});
});
