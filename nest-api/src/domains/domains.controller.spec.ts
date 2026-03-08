import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';

describe('DomainsController', () => {
	let controller: DomainsController;
	let service: jest.Mocked<
		Pick<
			DomainsService,
			| 'listDomains'
			| 'listExpiringDomains'
			| 'getDomainStats'
			| 'getRunnerSnapshot'
			| 'getDomain'
			| 'refreshWhois'
			| 'createDomain'
			| 'updateDomain'
			| 'deleteDomain'
			| 'renewDomain'
		>
	>;

	beforeEach(() => {
		service = {
			listDomains: jest.fn(),
			listExpiringDomains: jest.fn(),
			getDomainStats: jest.fn(),
			getRunnerSnapshot: jest.fn(),
			getDomain: jest.fn(),
			refreshWhois: jest.fn(),
			createDomain: jest.fn(),
			updateDomain: jest.fn(),
			deleteDomain: jest.fn(),
			renewDomain: jest.fn(),
		};

		controller = new DomainsController(service as unknown as DomainsService);
	});

	it('delegates domain operations', async () => {
		service.listDomains.mockResolvedValueOnce({
			domains: [],
			total: 0,
		} as never);
		service.getRunnerSnapshot.mockReturnValueOnce({ runs_total: 1 } as never);
		service.getDomain.mockResolvedValueOnce({ id: 1 } as never);
		service.createDomain.mockResolvedValueOnce({ status: 'success' } as never);

		await controller.listDomains(undefined, undefined, undefined, '10', '0');
		controller.getMaintenanceStatus();
		await controller.getDomain(1);
		await controller.createDomain({
			client_id: 1,
			domain_name: 'site.test',
			expiry_date: '2027-01-01',
		});

		expect(service.listDomains).toHaveBeenCalledWith({
			status: undefined,
			client_id: undefined,
			registrar: undefined,
			limit: 10,
			offset: 0,
		});
		expect(service.getRunnerSnapshot).toHaveBeenCalled();
		expect(service.getDomain).toHaveBeenCalledWith(1);
	});
});
