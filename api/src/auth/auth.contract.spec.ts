import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const guardedUser = {
	id: 1,
	email: 'admin@example.com',
	username: 'admin',
	full_name: 'Admin User',
	is_active: true,
	is_superuser: false,
};

describe('Auth HTTP Contract', () => {
	let app: INestApplication;
	const authService = {
		login: jest.fn(),
		register: jest.fn(),
		refresh: jest.fn(),
		me: jest.fn(),
		updateMe: jest.fn(),
		changePassword: jest.fn(),
		resolveRequiredUserFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveRequiredUserFromAuthorizationHeader.mockResolvedValue(
			guardedUser,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [AuthController],
			providers: [
				{
					provide: AuthService,
					useValue: authService,
				},
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

	it('POST /auth/login returns legacy-compatible token payload', async () => {
		authService.login.mockResolvedValueOnce({
			access_token: 'access-token',
			refresh_token: 'refresh-token',
			token_type: 'bearer',
		});

		const response = await request(app.getHttpServer())
			.post('/auth/login')
			.send({ username: 'admin', password: 'Password123!' })
			.expect(201);

		expect(response.body).toEqual({
			access_token: 'access-token',
			refresh_token: 'refresh-token',
			token_type: 'bearer',
		});
	});

	it('POST /auth/login returns 401 with legacy detail message on bad credentials', async () => {
		authService.login.mockRejectedValueOnce(
			new UnauthorizedException({
				detail: 'Incorrect email/username or password',
			}),
		);

		const response = await request(app.getHttpServer())
			.post('/auth/login')
			.send({ username: 'admin', password: 'wrong' })
			.expect(401);

		expect(response.body).toEqual({
			detail: 'Incorrect email/username or password',
		});
	});

	it('POST /auth/refresh returns legacy-compatible token payload', async () => {
		authService.refresh.mockResolvedValueOnce({
			access_token: 'new-access-token',
			refresh_token: 'new-refresh-token',
			token_type: 'bearer',
		});

		const response = await request(app.getHttpServer())
			.post('/auth/refresh')
			.send({ refresh_token: 'refresh-token' })
			.expect(201);

		expect(response.body).toEqual({
			access_token: 'new-access-token',
			refresh_token: 'new-refresh-token',
			token_type: 'bearer',
		});
	});

	it('GET /auth/me returns user profile from service', async () => {
		authService.me.mockResolvedValueOnce({
			id: 1,
			email: 'admin@example.com',
			username: 'admin',
			full_name: 'Admin User',
			is_active: true,
			is_superuser: false,
			created_at: new Date('2025-01-01T00:00:00.000Z').toISOString(),
			updated_at: new Date('2025-01-01T00:00:00.000Z').toISOString(),
		});

		const response = await request(app.getHttpServer())
			.get('/auth/me')
			.set('authorization', 'Bearer access-token')
			.expect(200);

		expect(response.body.email).toBe('admin@example.com');
		expect(authService.me).toHaveBeenCalledWith(guardedUser);
	});

	it('PUT /auth/password returns legacy success message', async () => {
		authService.changePassword.mockResolvedValueOnce({
			message: 'Password changed successfully',
		});

		const response = await request(app.getHttpServer())
			.put('/auth/password')
			.set('authorization', 'Bearer access-token')
			.send({
				current_password: 'Current123!',
				new_password: 'NewPassword123!',
			})
			.expect(200);

		expect(response.body).toEqual({ message: 'Password changed successfully' });
	});
});
