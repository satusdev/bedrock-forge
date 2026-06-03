/// <reference types="jest" />

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ENVIRONMENT_SCAN_TYPES } from '@bedrock-forge/shared';
import { TriggerEnvironmentScanDto } from './trigger-scan.dto';

describe('TriggerEnvironmentScanDto', () => {
	it('accepts every shared environment scan type', async () => {
		const dto = plainToInstance(TriggerEnvironmentScanDto, {
			types: ENVIRONMENT_SCAN_TYPES,
		});

		const errors = await validate(dto);

		expect(errors).toHaveLength(0);
	});

	it('rejects server-only scan types for environment scans', async () => {
		const dto = plainToInstance(TriggerEnvironmentScanDto, {
			types: ['WP_AUDIT', 'SSH_AUDIT'],
		});

		const errors = await validate(dto);

		expect(errors).toEqual(
			expect.arrayContaining([expect.objectContaining({ property: 'types' })]),
		);
	});
});

