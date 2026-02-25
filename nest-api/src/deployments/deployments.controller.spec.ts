import { DeploymentsController } from './deployments.controller';
import { DeploymentsService } from './deployments.service';

describe('DeploymentsController', () => {
	let controller: DeploymentsController;
	let service: jest.Mocked<
		Pick<DeploymentsService, 'promote' | 'getHistory' | 'rollback'>
	>;

	beforeEach(() => {
		service = {
			promote: jest.fn(),
			getHistory: jest.fn(),
			rollback: jest.fn(),
		};

		controller = new DeploymentsController(
			service as unknown as DeploymentsService,
		);
	});

	it('delegates promote/history/rollback', async () => {
		service.promote.mockResolvedValueOnce({ status: 'accepted' } as never);
		service.getHistory.mockResolvedValueOnce([] as never);
		service.rollback.mockResolvedValueOnce({ status: 'accepted' } as never);

		await controller.promote({
			staging_host: 's',
			staging_user: 'u',
			prod_host: 'p',
			prod_user: 'u',
			staging_url: 'https://s.example.com',
			prod_url: 'https://p.example.com',
		});
		await controller.history();
		await controller.rollback('site', { target_release: 'r1' });

		expect(service.promote).toHaveBeenCalled();
		expect(service.getHistory).toHaveBeenCalled();
		expect(service.rollback).toHaveBeenCalledWith('site', {
			target_release: 'r1',
		});
	});
});
