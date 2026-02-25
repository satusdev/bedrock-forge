import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { PluginPoliciesController } from './plugin-policies.controller';
import { PluginPoliciesService } from './plugin-policies.service';

describe('PluginPolicies HTTP Contract', () => {
	let app: INestApplication;
	const pluginPoliciesService = {
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
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [PluginPoliciesController],
			providers: [
				{ provide: PluginPoliciesService, useValue: pluginPoliciesService },
				{ provide: AuthService, useValue: authService },
			],
		}).compile();

		app = moduleRef.createNestApplication();
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('GET /plugin-policies/global returns policy payload', async () => {
		pluginPoliciesService.getGlobalPolicy.mockResolvedValueOnce({
			id: 1,
			name: 'Default',
		});

		const response = await request(app.getHttpServer())
			.get('/plugin-policies/global')
			.expect(200);

		expect(response.body.id).toBe(1);
	});

	it('PUT /plugin-policies/projects/:id upserts policy payload', async () => {
		pluginPoliciesService.upsertProjectPolicy.mockResolvedValueOnce({
			id: 2,
			project_id: 10,
		});

		const response = await request(app.getHttpServer())
			.put('/plugin-policies/projects/10')
			.send({ inherit_default: true })
			.expect(200);

		expect(response.body.project_id).toBe(10);
	});

	it('GET /plugin-policies/projects/:id returns 404 detail when missing', async () => {
		pluginPoliciesService.getProjectPolicy.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Project policy not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/plugin-policies/projects/999')
			.expect(404);

		expect(response.body).toEqual({ detail: 'Project policy not found' });
	});

	it('GET /plugin-policies/bundles returns bundles list', async () => {
		pluginPoliciesService.listBundles.mockResolvedValueOnce([
			{ id: 'core-security', name: 'Core Security' },
		]);

		const response = await request(app.getHttpServer())
			.get('/plugin-policies/bundles')
			.expect(200);

		expect(response.body[0].id).toBe('core-security');
	});

	it('GET /plugin-policies/project-servers/:id/drift returns drift payload', async () => {
		pluginPoliciesService.getPluginDrift.mockResolvedValueOnce({
			project_server_id: 3,
			project_id: 10,
			missing_required: [],
		});

		const response = await request(app.getHttpServer())
			.get('/plugin-policies/project-servers/3/drift')
			.expect(200);

		expect(response.body.project_server_id).toBe(3);
	});
});
