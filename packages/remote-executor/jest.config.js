/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['<rootDir>/src/**/*.spec.ts'],
	moduleNameMapper: {
		'^@bedrock-forge/shared$': '<rootDir>/../../packages/shared/src/index.ts',
	},
};
