import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { AuthService } from '../auth/auth.service';

describe('TagsController', () => {
	let controller: TagsController;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;
	let service: jest.Mocked<
		Pick<
			TagsService,
			| 'listTags'
			| 'getTag'
			| 'createTag'
			| 'updateTag'
			| 'deleteTag'
			| 'seedTags'
			| 'getProjectTags'
			| 'setProjectTags'
			| 'addProjectTag'
			| 'removeProjectTag'
			| 'getClientTags'
			| 'setClientTags'
			| 'addClientTag'
			| 'removeClientTag'
			| 'getServerTags'
			| 'setServerTags'
		>
	>;

	beforeEach(() => {
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest
				.fn()
				.mockResolvedValue(undefined),
		};

		service = {
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

		controller = new TagsController(
			service as unknown as TagsService,
			authService as unknown as AuthService,
		);
	});

	it('delegates list and seed operations', async () => {
		service.listTags.mockResolvedValueOnce([] as never);
		service.seedTags.mockResolvedValueOnce({ created: 2 } as never);

		await controller.listTags('word');
		await controller.seedTags();

		expect(service.listTags).toHaveBeenCalledWith('word');
		expect(service.seedTags).toHaveBeenCalled();
	});
});
