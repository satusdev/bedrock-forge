import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

describe('Tags HTTP Contract', () => {
	let app: INestApplication;
	const tagsService = {
		listTags: jest.fn(),
		getTag: jest.fn(),
		createTag: jest.fn(),
		updateTag: jest.fn(),
		deleteTag: jest.fn(),
		seedTags: jest.fn(),
		getProjectTags: jest.fn(),
		setProjectTags: jest.fn(),
		addProjectTag: jest.fn(),
		removeProjectTag: jest.fn(),
		getClientTags: jest.fn(),
		setClientTags: jest.fn(),
		addClientTag: jest.fn(),
		removeClientTag: jest.fn(),
		getServerTags: jest.fn(),
		setServerTags: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [TagsController],
			providers: [
				{ provide: TagsService, useValue: tagsService },
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

	it('GET /tags returns list payload', async () => {
		tagsService.listTags.mockResolvedValueOnce([{ id: 1, name: 'WordPress' }]);

		const response = await request(app.getHttpServer())
			.get('/tags')
			.expect(200);
		expect(response.body[0]?.name).toBe('WordPress');
	});

	it('GET /tags/:id returns 404 detail when missing', async () => {
		tagsService.getTag.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Tag not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/tags/404')
			.expect(404);

		expect(response.body).toEqual({ detail: 'Tag not found' });
	});
});
