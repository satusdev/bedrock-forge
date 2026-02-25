import { PluginPoliciesController } from './plugin-policies.controller';
import { PluginPoliciesService } from './plugin-policies.service';
import { AuthService } from '../auth/auth.service';

describe('PluginPoliciesController', () => {
	let controller: PluginPoliciesController;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;
	let service: jest.Mocked<
		Pick<
			PluginPoliciesService,
			| 'getGlobalPolicy'
			| 'updateGlobalPolicy'
			| 'getProjectPolicy'
			| 'upsertProjectPolicy'
			| 'getEffectivePolicy'
			| 'listBundles'
			| 'applyBundleToGlobalPolicy'
			| 'applyBundleToProjectPolicy'
			| 'getPluginDrift'
		>
	>;

	beforeEach(() => {
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest
				.fn()
				.mockResolvedValue(undefined),
		};

		service = {
			getGlobalPolicy: jest.fn(),
			updateGlobalPolicy: jest.fn(),
			getProjectPolicy: jest.fn(),
			upsertProjectPolicy: jest.fn(),
			getEffectivePolicy: jest.fn(),
			listBundles: jest.fn(),
			applyBundleToGlobalPolicy: jest.fn(),
			applyBundleToProjectPolicy: jest.fn(),
			getPluginDrift: jest.fn(),
		};

		controller = new PluginPoliciesController(
			service as unknown as PluginPoliciesService,
			authService as unknown as AuthService,
		);
	});

	it('delegates global endpoints', async () => {
		service.getGlobalPolicy.mockResolvedValueOnce({ id: 1 } as never);
		service.updateGlobalPolicy.mockResolvedValueOnce({ id: 1 } as never);

		await controller.getGlobalPolicy();
		await controller.updateGlobalPolicy({ name: 'Default' });

		expect(service.getGlobalPolicy).toHaveBeenCalledWith(undefined);
		expect(service.updateGlobalPolicy).toHaveBeenCalledWith(
			{
				name: 'Default',
			},
			undefined,
		);
	});

	it('delegates project endpoints', async () => {
		service.getProjectPolicy.mockResolvedValueOnce({ id: 2 } as never);
		service.upsertProjectPolicy.mockResolvedValueOnce({ id: 2 } as never);
		service.getEffectivePolicy.mockResolvedValueOnce({ id: 2 } as never);

		await controller.getProjectPolicy(10);
		await controller.upsertProjectPolicy(10, { inherit_default: true });
		await controller.getEffectivePolicy(10);

		expect(service.getProjectPolicy).toHaveBeenCalledWith(10, undefined);
		expect(service.upsertProjectPolicy).toHaveBeenCalledWith(
			10,
			{
				inherit_default: true,
			},
			undefined,
		);
		expect(service.getEffectivePolicy).toHaveBeenCalledWith(10, undefined);
	});

	it('delegates bundles and drift endpoints', async () => {
		service.listBundles.mockResolvedValueOnce([] as never);
		service.applyBundleToGlobalPolicy.mockResolvedValueOnce({ id: 1 } as never);
		service.applyBundleToProjectPolicy.mockResolvedValueOnce({
			id: 2,
		} as never);
		service.getPluginDrift.mockResolvedValueOnce({ project_id: 10 } as never);

		await controller.listBundles();
		await controller.applyBundleToGlobalPolicy('core-security');
		await controller.applyBundleToProjectPolicy(10, 'core-security');
		await controller.getPluginDrift(3);

		expect(service.listBundles).toHaveBeenCalled();
		expect(service.applyBundleToGlobalPolicy).toHaveBeenCalledWith(
			'core-security',
			undefined,
		);
		expect(service.applyBundleToProjectPolicy).toHaveBeenCalledWith(
			10,
			'core-security',
			undefined,
		);
		expect(service.getPluginDrift).toHaveBeenCalledWith(3, undefined);
	});
});
