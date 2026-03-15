import { CloudflareController } from './cloudflare.controller';
import { CloudflareService } from './cloudflare.service';

describe('CloudflareController', () => {
	let controller: CloudflareController;
	let service: jest.Mocked<
		Pick<
			CloudflareService,
			| 'connect'
			| 'disconnect'
			| 'getStatus'
			| 'listZones'
			| 'sync'
			| 'getExpiring'
		>
	>;

	beforeEach(() => {
		service = {
			connect: jest.fn(),
			disconnect: jest.fn(),
			getStatus: jest.fn(),
			listZones: jest.fn(),
			sync: jest.fn(),
			getExpiring: jest.fn(),
		};
		controller = new CloudflareController(
			service as unknown as CloudflareService,
		);
	});

	it('delegates all cloudflare endpoints', async () => {
		service.connect.mockResolvedValueOnce({ success: true } as never);
		service.disconnect.mockResolvedValueOnce({ success: true } as never);
		service.getStatus.mockResolvedValueOnce({ connected: true } as never);
		service.listZones.mockResolvedValueOnce([] as never);
		service.sync.mockResolvedValueOnce({ domains_synced: 0 } as never);
		service.getExpiring.mockResolvedValueOnce({ domains: [] } as never);

		await controller.connect({ api_token: 'cf-token-value' });
		await controller.disconnect();
		await controller.getStatus();
		await controller.listZones();
		await controller.sync();
		await controller.getExpiring({ days: 15 });

		expect(service.connect).toHaveBeenCalledWith({
			api_token: 'cf-token-value',
		});
		expect(service.disconnect).toHaveBeenCalled();
		expect(service.getStatus).toHaveBeenCalled();
		expect(service.listZones).toHaveBeenCalled();
		expect(service.sync).toHaveBeenCalled();
		expect(service.getExpiring).toHaveBeenCalledWith(15);
	});
});
