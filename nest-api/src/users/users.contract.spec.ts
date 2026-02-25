import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('Users HTTP Contract', () => {
	let app: INestApplication;
	const usersService = {
		listUsers: jest.fn(),
		getUser: jest.fn(),
		createUser: jest.fn(),
		updateUser: jest.fn(),
		deleteUser: jest.fn(),
		resetPassword: jest.fn(),
		getCurrentUserPermissions: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [UsersController],
			providers: [{ provide: UsersService, useValue: usersService }],
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

	it('GET /users returns array payload', async () => {
		usersService.listUsers.mockResolvedValueOnce([
			{ id: 1, username: 'admin', roles: [] },
		]);

		const response = await request(app.getHttpServer())
			.get('/users')
			.expect(200);
		expect(response.body[0]?.username).toBe('admin');
	});

	it('GET /users/ returns array payload via slash alias', async () => {
		usersService.listUsers.mockResolvedValueOnce([
			{ id: 2, username: 'slash-admin', roles: [] },
		]);

		const response = await request(app.getHttpServer())
			.get('/users/')
			.expect(200);

		expect(response.body[0]?.username).toBe('slash-admin');
	});

	it('PUT /users/:id updates user payload', async () => {
		usersService.updateUser.mockResolvedValueOnce({
			id: 1,
			username: 'admin',
			full_name: 'Admin Updated',
			roles: [],
		});

		const response = await request(app.getHttpServer())
			.put('/users/1')
			.send({ full_name: 'Admin Updated' })
			.expect(200);

		expect(response.body.full_name).toBe('Admin Updated');
	});

	it('GET /users/:id returns 404 detail when missing', async () => {
		usersService.getUser.mockRejectedValueOnce(
			new NotFoundException({ detail: 'User not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/users/999')
			.expect(404);

		expect(response.body).toEqual({ detail: 'User not found' });
	});
});
