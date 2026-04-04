import { Test } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { SettingsRepository } from './settings.repository';
import { EncryptionService } from '../../common/encryption/encryption.service';

const makeRepo = () => ({
	findAll: jest.fn(),
	findByKey: jest.fn(),
	upsert: jest.fn(),
	delete: jest.fn(),
});

const makeEnc = () => ({
	encrypt: jest.fn((v: string) => `enc:${v}`),
	decrypt: jest.fn((v: string) => v.replace('enc:', '')),
});

describe('SettingsService', () => {
	let service: SettingsService;
	let repo: ReturnType<typeof makeRepo>;
	let enc: ReturnType<typeof makeEnc>;

	beforeEach(async () => {
		repo = makeRepo();
		enc = makeEnc();
		const module = await Test.createTestingModule({
			providers: [
				SettingsService,
				{ provide: SettingsRepository, useValue: repo },
				{ provide: EncryptionService, useValue: enc },
			],
		}).compile();

		service = module.get(SettingsService);
	});

	it('get returns null if key not found', async () => {
		repo.findByKey.mockResolvedValue(null);
		expect(await service.get('missing')).toBeNull();
	});

	it('get returns { key, value } when found', async () => {
		repo.findByKey.mockResolvedValue({ key: 'site_name', value: 'Forge' });
		expect(await service.get('site_name')).toEqual({ key: 'site_name', value: 'Forge' });
	});

	it('set delegates to repo.upsert', async () => {
		repo.upsert.mockResolvedValue({ key: 'k', value: 'v' });
		await service.set('k', 'v');
		expect(repo.upsert).toHaveBeenCalledWith('k', 'v');
	});

	it('setEncrypted stores encrypted value', async () => {
		repo.upsert.mockResolvedValue(undefined);
		await service.setEncrypted('api_key', 'my-secret');
		expect(enc.encrypt).toHaveBeenCalledWith('my-secret');
		expect(repo.upsert).toHaveBeenCalledWith('api_key', 'enc:my-secret');
	});

	it('getDecrypted returns null when key absent', async () => {
		repo.findByKey.mockResolvedValue(null);
		expect(await service.getDecrypted('missing')).toBeNull();
	});

	it('getDecrypted decrypts stored value', async () => {
		repo.findByKey.mockResolvedValue({ key: 'api_key', value: 'enc:my-secret' });
		expect(await service.getDecrypted('api_key')).toBe('my-secret');
	});

	it('getDecrypted returns null if decryption throws', async () => {
		repo.findByKey.mockResolvedValue({ key: 'api_key', value: 'bad-cipher' });
		enc.decrypt.mockImplementation(() => { throw new Error('invalid'); });
		expect(await service.getDecrypted('api_key')).toBeNull();
	});

	it('hasEncrypted returns false when absent', async () => {
		repo.findByKey.mockResolvedValue(null);
		expect(await service.hasEncrypted('k')).toBe(false);
	});

	it('hasEncrypted returns true when present', async () => {
		repo.findByKey.mockResolvedValue({ key: 'k', value: 'enc:x' });
		expect(await service.hasEncrypted('k')).toBe(true);
	});
});
