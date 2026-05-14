import { SecurityServerScanProcessor } from './security-server-scan.processor';

describe('Security alert snapshot comparison', () => {
	function makeProcessor() {
		return new SecurityServerScanProcessor(
			{} as any,
			{} as any,
			{} as any,
			{} as any,
		) as any;
	}

	it('batches file additions, modifications, and deletions', () => {
		const processor = makeProcessor();
		const previous = {
			'/etc/ssh/sshd_config': { hash: 'a', size: 10, mtime: 1 },
			'/etc/sudoers': { hash: 'b', size: 20, mtime: 1 },
			'/root/.ssh/authorized_keys': { hash: 'c', size: 30, mtime: 1 },
		};
		const next = {
			'/etc/ssh/sshd_config': { hash: 'a', size: 10, mtime: 1 },
			'/etc/sudoers': { hash: 'changed', size: 22, mtime: 2 },
			'/etc/cron.d/new-job': { hash: 'd', size: 40, mtime: 1 },
		};

		expect(processor.compareSnapshots(previous, next)).toEqual({
			added: ['/etc/cron.d/new-job'],
			modified: ['/etc/sudoers'],
			deleted: ['/root/.ssh/authorized_keys'],
		});
	});

	it('does not alert on the initial snapshot baseline', () => {
		const processor = makeProcessor();

		expect(
			processor.hasFileChanges(
				processor.compareSnapshots(null, {
					'/etc/ssh/sshd_config': { hash: 'a', size: 10, mtime: 1 },
				}),
			),
		).toBe(false);
	});

	it('excludes noisy paths from remote scans by default', () => {
		const processor = makeProcessor();
		const command = processor.buildFileSnapshotCommand(['/var/www/site']);

		expect(command).toContain('*/vendor/*');
		expect(command).toContain('*/node_modules/*');
		expect(command).toContain('*/cache/*');
		expect(command).toContain('*/backups/*');
		expect(command).toContain('*/logs/*');
		expect(command).toContain('*/uploads/*');
	});
});
