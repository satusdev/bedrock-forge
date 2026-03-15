import { NotFoundException } from '@nestjs/common';
import { WpService } from './wp.service';
import { WpRepository } from './wp.repository';

type MockWpRepository = {
	ensureOwnedProjectServer: jest.Mock;
	insertAuditLog: jest.Mock;
	getSiteState: jest.Mock;
	getBulkUpdateProjectServerIds: jest.Mock;
	getPendingUpdates: jest.Mock;
	getUpdateHistory: jest.Mock;
	upsertSiteState: jest.Mock;
	persistScanFailure: jest.Mock;
	getOwnedProjectServerContext: jest.Mock;
	getProjectServerContextUnscoped: jest.Mock;
	persistResolvedWpPath: jest.Mock;
	getSystemPrivateKey: jest.Mock;
	getStaleProjectServerIds: jest.Mock;
};

describe('WpService', () => {
	let repo: MockWpRepository;
	let service: WpService;

	beforeEach(() => {
		repo = {
			ensureOwnedProjectServer: jest.fn().mockResolvedValue(undefined),
			insertAuditLog: jest.fn().mockResolvedValue(undefined),
			getSiteState: jest.fn(),
			getBulkUpdateProjectServerIds: jest.fn(),
			getPendingUpdates: jest.fn(),
			getUpdateHistory: jest.fn(),
			upsertSiteState: jest.fn().mockResolvedValue(undefined),
			persistScanFailure: jest.fn().mockResolvedValue(undefined),
			getOwnedProjectServerContext: jest.fn(),
			getProjectServerContextUnscoped: jest.fn(),
			persistResolvedWpPath: jest.fn().mockResolvedValue(undefined),
			getSystemPrivateKey: jest.fn().mockResolvedValue(null),
			getStaleProjectServerIds: jest.fn().mockResolvedValue([]),
		};
		service = new WpService(repo as unknown as WpRepository);
	});

	it('queues wp command for valid project-server', async () => {
		repo.ensureOwnedProjectServer.mockResolvedValueOnce(undefined);
		repo.insertAuditLog.mockResolvedValueOnce(undefined);

		const result = await service.runCommand(
			{
				project_server_id: 3,
				command: 'plugin',
				args: ['list'],
			},
			7,
		);

		expect(result.status).toBe('queued');
		expect(result.task_id).toBeDefined();
	});

	it('returns site state for valid project-server', async () => {
		repo.getSiteState.mockResolvedValueOnce({
			project_server_id: 3,
			project_name: 'Acme',
			server_name: 'Main',
			environment: 'production',
			wp_version: '6.5',
			wp_update_available: null,
			php_version: '8.2',
			plugins_count: 10,
			plugins_update_count: 1,
			themes_count: 2,
			themes_update_count: 0,
			users_count: 4,
			last_scanned_at: new Date(),
			scan_error: null,
		});

		const result = await service.getSiteState(3, 7);
		expect(result.environment).toBe('production');
		expect(result.plugins_count).toBe(10);
	});

	it('executes wp scan and returns completed payload', async () => {
		jest
			.spyOn(service as any, 'getOwnedProjectServerContext')
			.mockResolvedValueOnce({
				project_server_id: 3,
				project_name: 'Acme',
				environment: 'production',
				wp_path: '/var/www/acme',
				server_id: 8,
				server_name: 'Main',
				hostname: 'host',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
			});
		jest.spyOn(service as any, 'resolveSshKeyPath').mockResolvedValueOnce({
			keyFilePath: '/tmp/key',
			tempDirectory: undefined,
		});
		jest
			.spyOn(service as any, 'resolveWpRuntimeContext')
			.mockResolvedValueOnce({
				wpRoot: '/var/www/acme',
				wpPath: '/var/www/acme/web',
				wpCommand: '/var/www/acme/vendor/bin/wp',
			});
		// core version + php version + user count + core check-update
		jest
			.spyOn(service as any, 'runWpScalarCommand')
			.mockResolvedValueOnce('6.6.1')
			.mockResolvedValueOnce('8.2.12')
			.mockResolvedValueOnce('5')
			.mockResolvedValueOnce('[]');
		// plugin list + plugin update + theme list + theme update (no --skip flags)
		jest
			.spyOn(service as any, 'runWpCommandNoSkip')
			.mockResolvedValueOnce('[{"name":"akismet"}]')
			.mockResolvedValueOnce('[]')
			.mockResolvedValueOnce('[{"name":"twentytwentyfour"}]')
			.mockResolvedValueOnce('[]');
		repo.upsertSiteState.mockResolvedValueOnce(undefined);

		const result = await service.triggerSiteScan(3, 7);
		expect(result.status).toBe('completed');
		expect(result.plugins_count).toBe(1);
		expect(result.users_count).toBe(5);
	});

	it('discovers a canonical Bedrock runtime from remote wp-config paths', async () => {
		const runSshSpy = jest
			.spyOn(service as any, 'runSshCommand')
			.mockImplementation(async (...args: any[]) => {
				const command = String(args[1] ?? '');
				if (command.includes("-name 'wp-config.php'")) {
					return {
						stdout:
							'/home/mg.staging.ly/current/web/wp-config.php\n/home/mg.staging.ly/public_html/web/wp-config.php',
						stderr: '',
					};
				}
				return {
					stdout:
						'__FORGE_WP_OK__\n/home/mg.staging.ly/current\n/home/mg.staging.ly/current/web\n/home/mg.staging.ly/current/vendor/bin/wp',
					stderr: '',
				};
			});

		const runtime = await (service as any).resolveWpRuntimeContext(
			{
				project_server_id: 3,
				project_name: 'Acme',
				environment: 'production',
				wp_path: '/home/mg.staging.ly/public_html',
				server_id: 8,
				server_name: 'Main',
				hostname: 'host',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
			},
			'/tmp/key',
		);

		expect(runtime.wpRoot).toBe('/home/mg.staging.ly/current');
		expect(runtime.wpPath).toBe('/home/mg.staging.ly/current/web');
		expect(runSshSpy).toHaveBeenCalled();
	});

	it('builds multi-word wp-cli operations as separate shell-quoted args', async () => {
		const runSshSpy = jest
			.spyOn(service as any, 'runSshCommand')
			.mockResolvedValue({
				stdout: '6.6.1',
				stderr: '',
			});

		await (service as any).runWpScalarCommand(
			{
				project_server_id: 3,
				project_name: 'Acme',
				environment: 'production',
				wp_path: '/var/www/acme',
				server_id: 8,
				server_name: 'Main',
				hostname: 'host',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
			},
			'/tmp/key',
			{
				wpRoot: '/var/www/acme',
				wpPath: '/var/www/acme/web',
				wpCommand: '/var/www/acme/vendor/bin/wp',
			},
			['core', 'version'],
		);

		const builtCommand = String(runSshSpy.mock.calls[0]?.[1] ?? '');
		expect(builtCommand).toContain('WP_CLI_ALLOW_ROOT=1');
		expect(builtCommand).toContain('--skip-plugins --skip-themes');
		expect(builtCommand).toContain(`'core' 'version'`);
		expect(builtCommand).not.toContain(`'core version'`);
	});

	it('runWpCommandNoSkip omits --skip-plugins and --skip-themes flags', async () => {
		const runSshSpy = jest
			.spyOn(service as any, 'runSshCommand')
			.mockResolvedValue({ stdout: '[{}]', stderr: '' });

		await (service as any).runWpCommandNoSkip(
			{
				project_server_id: 3,
				project_name: 'Acme',
				environment: 'production',
				wp_path: '/var/www/acme',
				server_id: 8,
				server_name: 'Main',
				hostname: 'host',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
			},
			'/tmp/key',
			{
				wpRoot: '/var/www/acme',
				wpPath: '/var/www/acme/web',
				wpCommand: '/var/www/acme/vendor/bin/wp',
			},
			['plugin', 'list', '--format=json'],
		);

		const builtCommand = String(runSshSpy.mock.calls[0]?.[1] ?? '');
		expect(builtCommand).toContain('WP_CLI_ALLOW_ROOT=1');
		expect(builtCommand).not.toContain('--skip-plugins');
		expect(builtCommand).not.toContain('--skip-themes');
		expect(builtCommand).toContain(`'plugin' 'list' '--format=json'`);
	});

	it('falls back to filesystem scan when plugin list wp-cli call fails', async () => {
		jest
			.spyOn(service as any, 'getOwnedProjectServerContext')
			.mockResolvedValueOnce({
				project_server_id: 3,
				project_name: 'Acme',
				environment: 'production',
				wp_path: '/var/www/acme',
				server_id: 8,
				server_name: 'Main',
				hostname: 'host',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
			});
		jest.spyOn(service as any, 'resolveSshKeyPath').mockResolvedValueOnce({
			keyFilePath: '/tmp/key',
			tempDirectory: undefined,
		});
		jest
			.spyOn(service as any, 'resolveWpRuntimeContext')
			.mockResolvedValueOnce({
				wpRoot: '/var/www/acme',
				wpPath: '/var/www/acme/web',
				wpCommand: '/var/www/acme/vendor/bin/wp',
			});
		jest
			.spyOn(service as any, 'runWpScalarCommand')
			.mockResolvedValueOnce('6.6.1')
			.mockResolvedValueOnce('8.2.12')
			.mockResolvedValueOnce('3')
			.mockResolvedValueOnce('[]');
		// wp-cli plugin list fails → triggers filesystem fallback
		jest
			.spyOn(service as any, 'runWpCommandNoSkip')
			.mockRejectedValueOnce(new Error('wp-cli unavailable'))
			// theme list succeeds
			.mockResolvedValueOnce('[{"name":"twentytwentyfour"}]')
			.mockResolvedValueOnce('[]');
		jest
			.spyOn(service as any, 'scanPluginsViaFilesystem')
			.mockResolvedValueOnce([{ name: 'akismet', status: 'unknown', version: 'unknown', update: 'none' }]);
		repo.upsertSiteState.mockResolvedValueOnce(undefined);

		const result = await service.triggerSiteScan(3, 7);
		expect(result.status).toBe('completed');
		expect(result.plugins_count).toBe(1);
	});

	it('adds quiet SSH log level for WP remote commands', async () => {
		const execFileAsync = jest
			.spyOn(service as any, 'execFileAsync')
			.mockResolvedValueOnce({ stdout: '', stderr: '' });

		await (service as any).runSshCommand(
			{
				project_server_id: 3,
				project_name: 'Acme',
				environment: 'production',
				wp_path: '/var/www/acme',
				server_id: 8,
				server_name: 'Main',
				hostname: 'host',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
			},
			'pwd',
			'/tmp/key',
		);

		expect(execFileAsync).toHaveBeenCalledWith(
			'ssh',
			expect.arrayContaining(['-o', 'LogLevel=ERROR']),
			expect.any(Object),
		);
	});

	it('strips benign SSH host-key warnings from surfaced WP command failures', async () => {
		jest.spyOn(service as any, 'runSshCommand').mockRejectedValueOnce(
			Object.assign(new Error('wp failed'), {
				code: 1,
				stderr:
					"Warning: Permanently added '138.199.151.80' (ED25519) to the list of known hosts.\nError: Call to undefined function broken_plugin_bootstrap().",
			}),
		);

		await expect(
			(service as any).runWpScalarCommand(
				{
					project_server_id: 3,
					project_name: 'Acme',
					environment: 'production',
					wp_path: '/var/www/acme',
					server_id: 8,
					server_name: 'Main',
					hostname: 'host',
					ssh_user: 'root',
					ssh_port: 22,
					ssh_key_path: null,
					ssh_password: null,
					ssh_private_key: null,
				},
				'/tmp/key',
				{
					wpRoot: '/var/www/acme',
					wpPath: '/var/www/acme/web',
					wpCommand: '/var/www/acme/vendor/bin/wp',
				},
				['plugin', 'list', '--format=json'],
			),
		).rejects.toThrow(
			'wp plugin list --format=json failed: code=1; stderr=Error: Call to undefined function broken_plugin_bootstrap().',
		);
	});

	it('throws when project-server is missing', async () => {
		repo.ensureOwnedProjectServer.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Project-server not found' }),
		);

		await expect(
			service.runCommand(
				{
					project_server_id: 999,
					command: 'plugin',
				},
				7,
			),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('returns bulk update queue payload', async () => {
		repo.getBulkUpdateProjectServerIds.mockResolvedValueOnce([1, 2]);

		const result = await service.triggerBulkUpdate(
			{
				update_type: 'core',
				project_server_ids: [1, 2],
			},
			7,
		);

		expect(result.sites_queued).toBe(2);
		expect(result.task_id).toBeDefined();
	});

	it('returns pending updates summary payload', async () => {
		repo.getPendingUpdates.mockResolvedValueOnce([
			{
				project_server_id: 3,
				project_name: 'Acme',
				server_name: 'Main',
				environment: 'production',
				wp_version: '6.5',
				wp_update_available: '6.6',
				php_version: '8.2',
				plugins_count: 10,
				plugins_update_count: 1,
				themes_count: 2,
				themes_update_count: 0,
				users_count: 4,
				last_scanned_at: new Date(),
				scan_error: null,
			},
		]);

		const result = await service.getPendingUpdates(7);
		expect(result.total_sites).toBe(1);
		expect(result.total_updates).toBe(1);
		expect(result.sites_with_updates).toBe(1);
	});

	it('returns update history payload', async () => {
		repo.getUpdateHistory.mockResolvedValueOnce([
			{
				id: 1,
				project_server_id: 3,
				update_type: 'core',
				package_name: 'wordpress',
				from_version: '6.5',
				to_version: '6.6',
				status: 'success',
				applied_at: new Date(),
				error_message: null,
				created_at: new Date(),
			},
		]);

		const result = await service.getUpdateHistory(3, 25, 7);
		expect(result.total).toBe(1);
		expect(result.updates[0]?.project_server_id).toBe(3);
	});

	it('requires owner context for protected operations', async () => {
		await expect(service.getPendingUpdates()).rejects.toBeTruthy();
		await expect(
			service.runCommand({ project_server_id: 3, command: 'plugin' }),
		).rejects.toBeTruthy();
	});
});
