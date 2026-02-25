import { BadRequestException } from '@nestjs/common';
import { execFileSync } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { SettingsService } from './settings.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('SettingsService', () => {
	let prisma: MockPrisma;
	let service: SettingsService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new SettingsService(prisma as unknown as any);
	});

	it('returns configured false when no private key exists', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

		const result = await service.getSystemSSHKey();
		expect(result.configured).toBe(false);
	});

	it('rejects malformed private key input', async () => {
		await expect(
			service.updateSystemSSHKey('not-a-key'),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('rejects SHA256 fingerprint input with clear guidance', async () => {
		await expect(
			service.updateSystemSSHKey('SHA256:abc123examplefingerprint='),
		).rejects.toMatchObject({
			response: expect.objectContaining({
				detail: expect.stringContaining('fingerprint'),
			}),
		});
	});

	it('accepts OpenSSH private keys and stores derived public key', async () => {
		let sshKeygenAvailable = true;
		try {
			execFileSync('ssh-keygen', ['-h'], { stdio: 'ignore' });
		} catch {
			sshKeygenAvailable = false;
		}

		if (!sshKeygenAvailable) {
			return;
		}

		const dir = await mkdtemp(join(tmpdir(), 'forge-settings-test-'));
		const keyPath = join(dir, 'id_ed25519');

		try {
			execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', keyPath], {
				stdio: 'ignore',
			});
			const privateKey = await readFile(keyPath, 'utf-8');

			const result = await service.updateSystemSSHKey(privateKey);

			expect(result.configured).toBe(true);
			expect(result.public_key).toMatch(/^ssh-ed25519\s+/);
			expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('accepts OpenSSH private keys pasted with escaped newlines', async () => {
		let sshKeygenAvailable = true;
		try {
			execFileSync('ssh-keygen', ['-h'], { stdio: 'ignore' });
		} catch {
			sshKeygenAvailable = false;
		}

		if (!sshKeygenAvailable) {
			return;
		}

		const dir = await mkdtemp(join(tmpdir(), 'forge-settings-test-'));
		const keyPath = join(dir, 'id_ed25519');

		try {
			execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', keyPath], {
				stdio: 'ignore',
			});
			const privateKey = await readFile(keyPath, 'utf-8');
			const escaped = privateKey.replace(/\n/g, '\\n');

			const result = await service.updateSystemSSHKey(escaped);

			expect(result.configured).toBe(true);
			expect(result.public_key).toMatch(/^ssh-ed25519\s+/);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
