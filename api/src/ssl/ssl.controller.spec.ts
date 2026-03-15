import { SslController } from './ssl.controller';
import { SslService } from './ssl.service';
import { AuthService } from '../auth/auth.service';

describe('SslController', () => {
	let controller: SslController;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;
	let service: jest.Mocked<
		Pick<
			SslService,
			| 'listCertificates'
			| 'listExpiringCertificates'
			| 'getSslStats'
			| 'getCertificate'
			| 'createCertificate'
			| 'updateCertificate'
			| 'deleteCertificate'
			| 'renewCertificate'
		>
	>;

	beforeEach(() => {
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest
				.fn()
				.mockResolvedValue(undefined),
		};

		service = {
			listCertificates: jest.fn(),
			listExpiringCertificates: jest.fn(),
			getSslStats: jest.fn(),
			getCertificate: jest.fn(),
			createCertificate: jest.fn(),
			updateCertificate: jest.fn(),
			deleteCertificate: jest.fn(),
			renewCertificate: jest.fn(),
		};

		controller = new SslController(
			service as unknown as SslService,
			authService as unknown as AuthService,
		);
	});

	it('delegates list/get operations', async () => {
		service.listCertificates.mockResolvedValueOnce({
			certificates: [],
			total: 0,
		} as never);
		service.getCertificate.mockResolvedValueOnce({ id: 1 } as never);

		await controller.listCertificates(undefined, undefined, '10', '0');
		await controller.getCertificate(1);

		expect(service.listCertificates).toHaveBeenCalledWith({
			provider: undefined,
			is_active: undefined,
			limit: 10,
			offset: 0,
			owner_id: undefined,
		});
		expect(service.getCertificate).toHaveBeenCalledWith(1, undefined);
	});
});
