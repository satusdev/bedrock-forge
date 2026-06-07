import {
	shellQuote,
	flipProtocol,
	createRemoteMyCnf,
	cleanupRemoteMyCnf,
	isValidTableName,
	sanitizeTableList,
	pushRemoteScript,
	WpCliBuilder,
	ComposerCommandBuilder,
} from './processor-utils';
import { RemoteExecutorService } from '@bedrock-forge/remote-executor';

// Mock fs/promises for pushRemoteScript
jest.mock('fs/promises', () => ({
	readFile: jest.fn().mockResolvedValue(Buffer.from('fake content')),
}));

describe('shellQuote', () => {
	it('wraps a plain string in single quotes', () => {
		expect(shellQuote('hello')).toBe("'hello'");
	});

	it('escapes embedded single quotes', () => {
		expect(shellQuote("it's")).toBe("'it'\\''s'");
	});

	it('handles empty string', () => {
		expect(shellQuote('')).toBe("''");
	});

	it('handles strings with spaces and special chars', () => {
		const result = shellQuote('path with spaces & $VARS');
		expect(result).toBe("'path with spaces & $VARS'");
	});

	it('handles multiple single quotes', () => {
		expect(shellQuote("a'b'c")).toBe("'a'\\''b'\\''c'");
	});
});

describe('flipProtocol', () => {
	it('flips https to http', () => {
		expect(flipProtocol('https://example.com')).toBe('http://example.com');
	});

	it('flips http to https', () => {
		expect(flipProtocol('http://example.com')).toBe('https://example.com');
	});

	it('returns null for non-http/https URL', () => {
		expect(flipProtocol('ftp://example.com')).toBeNull();
	});

	it('returns null for bare domain', () => {
		expect(flipProtocol('example.com')).toBeNull();
	});

	it('preserves path and query string when flipping', () => {
		expect(flipProtocol('https://example.com/path?foo=bar')).toBe(
			'http://example.com/path?foo=bar',
		);
	});
});

describe('createRemoteMyCnf & cleanupRemoteMyCnf', () => {
	let mockExecutor: jest.Mocked<any>;

	beforeEach(() => {
		mockExecutor = {
			execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
			pushFile: jest.fn().mockResolvedValue(undefined),
		};
	});

	it('creates remote my.cnf file with correct content and permissions', async () => {
		const creds = { dbUser: 'user', dbPassword: 'password', dbHost: 'localhost' };
		const remotePath = await createRemoteMyCnf(mockExecutor, creds, 123, 'test');

		expect(remotePath).toContain('/tmp/test_mycnf_123_');
		expect(mockExecutor.pushFile).toHaveBeenCalledWith({
			remotePath,
			content: expect.any(Buffer),
		});
		expect(mockExecutor.execute).toHaveBeenCalledWith(`chmod 600 '${remotePath}'`);
	});

	it('cleans up remote my.cnf file', async () => {
		await cleanupRemoteMyCnf(mockExecutor, '/tmp/stale.cnf');
		expect(mockExecutor.execute).toHaveBeenCalledWith(`rm -f '/tmp/stale.cnf'`);
	});
});

describe('isValidTableName & sanitizeTableList', () => {
	it('validates table names correctly', () => {
		expect(isValidTableName('wp_posts')).toBe(true);
		expect(isValidTableName('wp_users$test')).toBe(true);
		expect(isValidTableName('wp_posts; DROP TABLE wp_users;')).toBe(false);
		expect(isValidTableName('wp_posts ')).toBe(false);
	});

	it('filters and normalizes table lists', () => {
		const list = [' wp_posts ', 'wp_posts', 'wp_users; DROP TABLE', 'wp_comments'];
		expect(sanitizeTableList(list)).toEqual(['wp_posts', 'wp_comments']);
	});
});

describe('pushRemoteScript', () => {
	it('pushes local script to remote path', async () => {
		const mockExecutor = {
			pushFile: jest.fn().mockResolvedValue(undefined),
		} as any;

		await pushRemoteScript(mockExecutor, '/local/path.php', '/remote/path.php');
		expect(mockExecutor.pushFile).toHaveBeenCalledWith({
			remotePath: '/remote/path.php',
			content: expect.any(Buffer),
		});
	});
});

describe('WpCliBuilder', () => {
	it('constructs correct wp-cli commands', () => {
		const builder = new WpCliBuilder('sudo -u user', '', '/bin/lsphp', '/bin/wp', '/var/www');
		const cmd = builder.buildCommand('plugin list');
		expect(cmd).toBe("sudo -u user '/bin/lsphp' '/bin/wp' plugin list --path='/var/www' 2>&1");
	});

	it('does not double-append path if it is already present in args', () => {
		const builder = new WpCliBuilder('sudo -u user', '', '/bin/lsphp', '/bin/wp', '/var/www');
		const cmd = builder.buildCommand('plugin list --path=\'/var/www\'');
		expect(cmd).toBe("sudo -u user '/bin/lsphp' '/bin/wp' plugin list --path='/var/www' 2>&1");
	});

	it('builds cd command correctly', () => {
		const builder = new WpCliBuilder('sudo -u user', '--allow-root', null, null, '/var/www');
		const cmd = builder.buildCdCommand('plugin list');
		expect(cmd).toBe("cd '/var/www' && wp plugin list --allow-root 2>&1");
	});

	it('creates builder via static method by detecting prefix', async () => {
		const mockExecutor = {
			execute: jest.fn().mockResolvedValue({ code: 0, stdout: 'site_user', stderr: '' }),
		} as any;
		const builder = await WpCliBuilder.create(mockExecutor, '/var/www');
		expect(builder.prefix).toBe('sudo -u site_user');
		expect(builder.allowRootFlag).toBe('');
	});
});

describe('ComposerCommandBuilder', () => {
	it('builds basic composer command options', () => {
		const builder = new ComposerCommandBuilder('/tmp/script.php', '/var/www');
		const cmd = builder.build('update-all');
		expect(cmd).toBe("php '/tmp/script.php' --docroot='/var/www' --action='update-all'");
	});

	it('builds composer command with optional package, version, and constraint options', () => {
		const builder = new ComposerCommandBuilder('/tmp/script.php', '/var/www', '/usr/bin/lsphp');
		const cmd = builder.build('add', {
			package: 'wpackagist-plugin/akismet',
			version: '1.2.3',
			constraint: '^1.2',
		});
		expect(cmd).toBe(
			"'/usr/bin/lsphp' '/tmp/script.php' --docroot='/var/www' --action='add' --package='wpackagist-plugin/akismet' --version='1.2.3' --constraint='^1.2'",
		);
	});
});
