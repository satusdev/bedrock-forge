/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
	moduleFileExtensions: ['js', 'json', 'ts'],
	rootDir: 'src',
	testRegex: '.*\\.spec\\.ts$',
	transform: {
		'^.+\\.ts$': ['ts-jest', { diagnostics: { ignoreCodes: [151002] } }],
	},
	collectCoverageFrom: ['**/*.(t|j)s'],
	coverageDirectory: '../coverage',
	testEnvironment: 'node',
	moduleNameMapper: {
		'^@bedrock-forge/shared(.*)$': '<rootDir>/../../../packages/shared/src$1',
	},
};
