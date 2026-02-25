import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';

describe('RBAC HTTP Contract', () => {
	let app: INestApplication;
	const rbacService = {
		listPermissions: jest.fn(),
		seedPermissions: jest.fn(),
		listRoles: jest.fn(),
		getRole: jest.fn(),
		createRole: jest.fn(),
		updateRole: jest.fn(),
		deleteRole: jest.fn(),
		seedRoles: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [RbacController],
			providers: [{ provide: RbacService, useValue: rbacService }],
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

	it('GET /rbac/permissions returns list', async () => {
		rbacService.listPermissions.mockResolvedValueOnce([
			{ id: 1, code: 'projects.view' },
		]);

		const response = await request(app.getHttpServer())
			.get('/rbac/permissions')
			.expect(200);

		expect(response.body[0]?.code).toBe('projects.view');
	});

	it('GET /rbac/roles/:id returns 404 detail when missing', async () => {
		rbacService.getRole.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Role not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/rbac/roles/99')
			.expect(404);

		expect(response.body).toEqual({ detail: 'Role not found' });
	});
});
