import { DeploymentsService } from './deployments.service';

describe('DeploymentsService', () => {
	let service: DeploymentsService;

	beforeEach(() => {
		service = new DeploymentsService();
	});

	it('creates promotion task and stores log', async () => {
		const result = await service.promote({
			staging_host: 'staging.example.com',
			staging_user: 'forge',
			prod_host: 'prod.example.com',
			prod_user: 'forge',
			staging_url: 'https://staging.example.com',
			prod_url: 'https://example.com',
		});

		expect(result.status).toBe('accepted');
		expect(result.task_id).toBeDefined();

		const history = await service.getHistory();
		expect(history).toHaveLength(1);
		expect(history[0]?.action).toBe('Promote Staging->Prod');
	});

	it('creates rollback task and stores log', async () => {
		const result = await service.rollback('site-a', {
			target_release: 'release-2026-02-01',
		});

		expect(result.status).toBe('accepted');
		expect(result.message).toBe('Rollback started');

		const history = await service.getHistory();
		expect(history[0]?.action).toContain('Rollback site-a');
	});
});
