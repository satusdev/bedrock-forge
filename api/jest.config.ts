import type { Config } from 'jest';

const config: Config = {
	moduleFileExtensions: ['js', 'json', 'ts'],
	rootDir: '.',
	testEnvironment: 'node',
	testRegex: '.*\\.spec\\.ts$',
	transform: {
		'^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }],
	},
	collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts'],
};

export default config;
