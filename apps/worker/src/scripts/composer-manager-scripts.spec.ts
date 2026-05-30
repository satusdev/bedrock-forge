/// <reference types="jest" />

import { execFileSync } from 'child_process';
import {
	chmodSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const customPluginManager = resolve(
	__dirname,
	'../../scripts/custom-plugin-manager.php',
);
const composerManager = resolve(__dirname, '../../scripts/composer-manager.php');

function makeFixture() {
	const root = mkdtempSync(join(tmpdir(), 'bf-composer-manager-'));
	const binDir = join(root, 'bin');
	const projectDir = join(root, 'site');
	const docroot = join(projectDir, 'web');
	const composerLog = join(root, 'composer.log');

	mkdirSync(binDir);
	mkdirSync(docroot, { recursive: true });
	writeFileSync(
		join(projectDir, 'composer.json'),
		JSON.stringify(
			{
				name: 'fixture/site',
				require: {
					'roots/bedrock': '^1.0',
					'wpackagist-plugin/sample-plugin': '^1.0',
				},
				extra: {
					'installer-paths': {
						'web/app/plugins/{$name}/': ['type:wordpress-plugin'],
					},
				},
			},
			null,
			2,
		) + '\n',
	);
	writeFileSync(join(projectDir, 'composer.lock'), '{"lock":"original"}' + '\n');

	const fakeComposer = join(binDir, 'composer');
	writeFileSync(
		fakeComposer,
		[
			'#!/usr/bin/env bash',
			'printf "ALLOW=%s\\n" "${COMPOSER_ALLOW_SUPERUSER:-}" >> "$COMPOSER_LOG"',
			'printf "NOINT=%s\\n" "${COMPOSER_NO_INTERACTION:-}" >> "$COMPOSER_LOG"',
			'printf "ARGS:%s\\n" "$*" >> "$COMPOSER_LOG"',
			'if [ "$1" = "--version" ]; then echo "Composer version fake"; exit 0; fi',
			'if [ "${FAIL_COMPOSER:-}" = "1" ]; then',
			'  printf "%s\\n" \'{"lock":"modified"}\' > composer.lock',
			'  echo "composer failed intentionally"',
			'  exit 4',
			'fi',
			'echo "composer ok"',
			'exit 0',
			'',
		].join('\n'),
	);
	chmodSync(fakeComposer, 0o755);

	const env = {
		...process.env,
		PATH: `${binDir}:${process.env.PATH ?? ''}`,
		COMPOSER_LOG: composerLog,
	};

	return {
		root,
		projectDir,
		docroot,
		composerLog,
		env,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

function runPhp(script: string, args: string[], env: NodeJS.ProcessEnv) {
	return execFileSync('php', [script, ...args], {
		env,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
}

describe('Composer manager PHP scripts', () => {
	it('adds a custom plugin by refreshing monorepo-fetcher with superuser Composer enabled', () => {
		const fixture = makeFixture();
		try {
			runPhp(
				customPluginManager,
				[
					'--action=add',
					`--docroot=${fixture.docroot}`,
					'--slug=wp-secure-guard',
					'--repo-url=git@github.com:satusdev/wp-secure-guard.git',
					'--repo-path=.',
					'--type=plugin',
				],
				fixture.env,
			);

			const composerJson = JSON.parse(
				readFileSync(join(fixture.projectDir, 'composer.json'), 'utf8'),
			);
			const source = composerJson.extra['monorepo-sources'][0];
			const composerLog = readFileSync(fixture.composerLog, 'utf8');

			expect(composerJson.require['satusdev/monorepo-fetcher']).toBe(
				'dev-main',
			);
			expect(source).toMatchObject({
				type: 'plugin',
				url: 'git@github.com:satusdev/wp-secure-guard.git',
				path: '.',
				target: 'web/app/plugins',
				require: ['wp-secure-guard'],
			});
			expect(composerLog).toContain('ALLOW=1');
			expect(composerLog).toContain('NOINT=1');
			expect(composerLog).toContain(
				'ARGS:update satusdev/monorepo-fetcher --no-dev --no-interaction -W',
			);
		} finally {
			fixture.cleanup();
		}
	});

	it('removes a custom plugin source using composer install', () => {
		const fixture = makeFixture();
		try {
			const composerPath = join(fixture.projectDir, 'composer.json');
			const composerJson = JSON.parse(readFileSync(composerPath, 'utf8'));
			composerJson.extra['monorepo-sources'] = [
				{
					type: 'plugin',
					url: 'git@github.com:satusdev/wp-secure-guard.git',
					path: '.',
					target: 'web/app/plugins',
					require: ['wp-secure-guard'],
				},
			];
			writeFileSync(composerPath, JSON.stringify(composerJson, null, 2) + '\n');

			runPhp(
				customPluginManager,
				[
					'--action=remove',
					`--docroot=${fixture.docroot}`,
					'--slug=wp-secure-guard',
					'--repo-url=git@github.com:satusdev/wp-secure-guard.git',
					'--repo-path=.',
				],
				fixture.env,
			);

			const updated = JSON.parse(readFileSync(composerPath, 'utf8'));
			const composerLog = readFileSync(fixture.composerLog, 'utf8');

			expect(updated.extra['monorepo-sources']).toBeUndefined();
			expect(composerLog).toContain(
				'ARGS:install --no-dev --no-interaction',
			);
		} finally {
			fixture.cleanup();
		}
	});

	it('restores composer files when custom plugin add fails', () => {
		const fixture = makeFixture();
		try {
			const composerPath = join(fixture.projectDir, 'composer.json');
			const lockPath = join(fixture.projectDir, 'composer.lock');
			const originalComposer = readFileSync(composerPath, 'utf8');
			const originalLock = readFileSync(lockPath, 'utf8');

			expect(() =>
				runPhp(
					customPluginManager,
					[
						'--action=add',
						`--docroot=${fixture.docroot}`,
						'--slug=wp-secure-guard',
						'--repo-url=git@github.com:satusdev/wp-secure-guard.git',
						'--repo-path=.',
						'--type=plugin',
					],
					{ ...fixture.env, FAIL_COMPOSER: '1' },
				),
			).toThrow();

			expect(readFileSync(composerPath, 'utf8')).toBe(originalComposer);
			expect(readFileSync(lockPath, 'utf8')).toBe(originalLock);
		} finally {
			fixture.cleanup();
		}
	});

	it('restores composer files when changing a wpackagist constraint fails', () => {
		const fixture = makeFixture();
		try {
			const composerPath = join(fixture.projectDir, 'composer.json');
			const lockPath = join(fixture.projectDir, 'composer.lock');
			const originalComposer = readFileSync(composerPath, 'utf8');
			const originalLock = readFileSync(lockPath, 'utf8');

			expect(() =>
				runPhp(
					composerManager,
					[
						`--docroot=${fixture.docroot}`,
						'--action=change-constraint',
						'--package=wpackagist-plugin/sample-plugin',
						'--constraint=^2.0',
					],
					{ ...fixture.env, FAIL_COMPOSER: '1' },
				),
			).toThrow();

			expect(readFileSync(composerPath, 'utf8')).toBe(originalComposer);
			expect(readFileSync(lockPath, 'utf8')).toBe(originalLock);
		} finally {
			fixture.cleanup();
		}
	});
});
