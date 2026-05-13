/// <reference types="jest" />

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

describe('PaginationQueryDto', () => {
	async function validateDto(input: Record<string, unknown>) {
		const dto = plainToInstance(PaginationQueryDto, input);
		const errors = await validate(dto, { whitelist: true });
		return { dto, errors };
	}

	it('accepts default pagination values', async () => {
		const { dto, errors } = await validateDto({});

		expect(errors).toHaveLength(0);
		expect(dto.page).toBe(1);
		expect(dto.limit).toBe(20);
	});

	it('bounds page and limit values', async () => {
		await expect(validateDto({ page: 0, limit: 20 })).resolves.toMatchObject({
			errors: expect.arrayContaining([
				expect.objectContaining({ property: 'page' }),
			]),
		});

		await expect(validateDto({ page: 1, limit: 101 })).resolves.toMatchObject({
			errors: expect.arrayContaining([
				expect.objectContaining({ property: 'limit' }),
			]),
		});
	});

	it('trims search input and rejects excessive search strings', async () => {
		const accepted = await validateDto({ search: '  wordpress  ' });
		expect(accepted.errors).toHaveLength(0);
		expect(accepted.dto.search).toBe('wordpress');

		const rejected = await validateDto({ search: 'x'.repeat(101) });
		expect(rejected.errors).toEqual(
			expect.arrayContaining([expect.objectContaining({ property: 'search' })]),
		);
	});

	it('normalizes blank search strings to undefined', async () => {
		const { dto, errors } = await validateDto({ search: '   ' });

		expect(errors).toHaveLength(0);
		expect(dto.search).toBeUndefined();
	});
});
