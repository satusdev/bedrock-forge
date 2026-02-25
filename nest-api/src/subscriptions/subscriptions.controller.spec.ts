import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { AuthService } from '../auth/auth.service';

describe('SubscriptionsController', () => {
	let controller: SubscriptionsController;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;
	let service: jest.Mocked<
		Pick<
			SubscriptionsService,
			| 'listSubscriptions'
			| 'listExpiring'
			| 'getStatsSummary'
			| 'getSubscription'
			| 'createSubscription'
			| 'updateSubscription'
			| 'cancelSubscription'
			| 'renewSubscription'
			| 'generateRenewalInvoice'
		>
	>;

	beforeEach(() => {
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest
				.fn()
				.mockResolvedValue(undefined),
		};

		service = {
			listSubscriptions: jest.fn(),
			listExpiring: jest.fn(),
			getStatsSummary: jest.fn(),
			getSubscription: jest.fn(),
			createSubscription: jest.fn(),
			updateSubscription: jest.fn(),
			cancelSubscription: jest.fn(),
			renewSubscription: jest.fn(),
			generateRenewalInvoice: jest.fn(),
		};
		controller = new SubscriptionsController(
			service as unknown as SubscriptionsService,
			authService as unknown as AuthService,
		);
	});

	it('delegates subscription routes', async () => {
		service.listSubscriptions.mockResolvedValueOnce({
			subscriptions: [],
			total: 0,
		} as never);
		service.listExpiring.mockResolvedValueOnce({ count: 0 } as never);
		service.getStatsSummary.mockResolvedValueOnce({ total_active: 0 } as never);
		service.getSubscription.mockResolvedValueOnce({ id: 1 } as never);
		service.createSubscription.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.updateSubscription.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.cancelSubscription.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.renewSubscription.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.generateRenewalInvoice.mockResolvedValueOnce({
			status: 'success',
		} as never);

		await controller.listSubscriptions('hosting', 'active', '2', '10', '0');
		await controller.listExpiring('30');
		await controller.getStatsSummary();
		await controller.getSubscription(1);
		await controller.createSubscription({
			client_id: 2,
			name: 'Plan',
			amount: 10,
		});
		await controller.updateSubscription(1, { amount: 20 });
		await controller.cancelSubscription(1);
		await controller.renewSubscription(1);
		await controller.generateRenewalInvoice(1);

		expect(service.listSubscriptions).toHaveBeenCalledWith({
			subscription_type: 'hosting',
			status: 'active',
			client_id: 2,
			limit: 10,
			offset: 0,
			owner_id: undefined,
		});
		expect(service.listExpiring).toHaveBeenCalledWith(30, undefined);
		expect(service.getStatsSummary).toHaveBeenCalledWith(undefined);
		expect(service.getSubscription).toHaveBeenCalledWith(1, undefined);
		expect(service.createSubscription).toHaveBeenCalledWith(
			{
				client_id: 2,
				name: 'Plan',
				amount: 10,
			},
			undefined,
		);
		expect(service.updateSubscription).toHaveBeenCalledWith(
			1,
			{ amount: 20 },
			undefined,
		);
		expect(service.cancelSubscription).toHaveBeenCalledWith(1, undefined);
		expect(service.renewSubscription).toHaveBeenCalledWith(1, undefined);
		expect(service.generateRenewalInvoice).toHaveBeenCalledWith(1, undefined);
	});
});
