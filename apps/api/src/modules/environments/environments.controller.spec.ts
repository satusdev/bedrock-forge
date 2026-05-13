/// <reference types="jest" />

import 'reflect-metadata';
import { ROLES } from '@bedrock-forge/shared';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { EnvironmentsController } from './environments.controller';

describe('EnvironmentsController RBAC metadata', () => {
	function requiredRoles(methodName: keyof EnvironmentsController) {
		return Reflect.getMetadata(
			ROLES_KEY,
			EnvironmentsController.prototype[methodName],
		) as string[] | undefined;
	}

	it('requires manager role explicitly for environment write operations', () => {
		expect(requiredRoles('scanServer')).toEqual([ROLES.MANAGER]);
		expect(requiredRoles('create')).toEqual([ROLES.MANAGER]);
		expect(requiredRoles('update')).toEqual([ROLES.MANAGER]);
		expect(requiredRoles('upsertDbCredentials')).toEqual([ROLES.MANAGER]);
		expect(requiredRoles('createWpQuickLogin')).toEqual([ROLES.MANAGER]);
	});

	it('requires admin role for destructive environment removal', () => {
		expect(requiredRoles('remove')).toEqual([ROLES.ADMIN]);
	});
});
