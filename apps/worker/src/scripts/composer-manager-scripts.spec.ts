/// <reference types="jest" />

import { execFileSync } from 'child_process';
import {
	chmodSync,
	existsSync,
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
const wpActions = resolve(__dirname, '../../scripts/wp-actions.php');

function makeFixture(composerKind: 'bash' | 'php' = 'bash') {
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
	if (composerKind === 'php') {
		writeFileSync(
			fakeComposer,
			[
				'#!/usr/bin/env php',
				'<?php',
				'$log = getenv("COMPOSER_LOG");',
				'file_put_contents($log, "PHP_BINARY=" . PHP_BINARY . "\\n", FILE_APPEND);',
				'file_put_contents($log, "ALLOW=" . getenv("COMPOSER_ALLOW_SUPERUSER") . "\\n", FILE_APPEND);',
				'file_put_contents($log, "NOINT=" . getenv("COMPOSER_NO_INTERACTION") . "\\n", FILE_APPEND);',
				'file_put_contents($log, "TOKEN=" . getenv("REPO_FETCHER_TOKEN") . "\\n", FILE_APPEND);',
				'file_put_contents($log, "ARGS:" . implode(" ", array_slice($argv, 1)) . "\\n", FILE_APPEND);',
				'if (($argv[1] ?? "") === "--version") { echo "Composer version fake\\n"; exit(0); }',
				'if (getenv("FAIL_COMPOSER") === "1") {',
				'  file_put_contents("composer.lock", "{\\"lock\\":\\"modified\\"}\\n");',
				'  echo "composer failed intentionally\\n";',
				'  exit(4);',
				'}',
				'echo "composer ok\\n";',
				'exit(0);',
				'',
			].join('\n'),
		);
	} else {
		writeFileSync(
			fakeComposer,
			[
				'#!/usr/bin/env bash',
				'printf "ALLOW=%s\\n" "${COMPOSER_ALLOW_SUPERUSER:-}" >> "$COMPOSER_LOG"',
				'printf "NOINT=%s\\n" "${COMPOSER_NO_INTERACTION:-}" >> "$COMPOSER_LOG"',
				'printf "TOKEN=%s\\n" "${REPO_FETCHER_TOKEN:-}" >> "$COMPOSER_LOG"',
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
	}
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
	it('runs wp-actions WP-CLI calls through WP_CLI_PHP with skip-plugins', () => {
		const root = mkdtempSync(join(tmpdir(), 'bf-wp-actions-'));
		try {
			const docroot = join(root, 'site');
			const wpPath = join(docroot, 'web', 'wp');
			const vendorBin = join(wpPath, 'vendor', 'bin');
			const wpLog = join(root, 'wp.log');
			mkdirSync(vendorBin, { recursive: true });

			const fakeWp = join(vendorBin, 'wp');
			writeFileSync(
				fakeWp,
				[
					'#!/usr/bin/env php',
					'<?php',
					'file_put_contents(getenv("WP_ACTIONS_LOG"), "PHP_BINARY=" . PHP_BINARY . "\\n", FILE_APPEND);',
					'file_put_contents(getenv("WP_ACTIONS_LOG"), "ARGS:" . implode(" ", array_slice($argv, 1)) . "\\n", FILE_APPEND);',
					'echo "wp ok\\n";',
					'exit(0);',
					'',
				].join('\n'),
			);
			chmodSync(fakeWp, 0o755);

			const phpBinary = execFileSync('php', ['-r', 'echo PHP_BINARY;'], {
				encoding: 'utf8',
			});
			const output = runPhp(
				wpActions,
				[
					`--docroot=${docroot}`,
					`--wp-path=${wpPath}`,
					'--action=clear_cache',
				],
				{
					...process.env,
					WP_CLI_PHP: phpBinary,
					WP_ACTIONS_LOG: wpLog,
				},
			);

			expect(JSON.parse(output)).toMatchObject({
				success: true,
				action: 'clear_cache',
			});
			const log = readFileSync(wpLog, 'utf8');
			expect(log).toContain(`PHP_BINARY=${phpBinary}`);
			expect(log).toContain('ARGS:cache flush --skip-plugins');
			expect(log).toContain(`--path=${wpPath}`);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('executes PHP-based composer launchers through the current PHP binary', () => {
		const fixture = makeFixture('php');
		try {
			const phpBinary = execFileSync('php', ['-r', 'echo PHP_BINARY;'], {
				encoding: 'utf8',
			});

			runPhp(
				composerManager,
				[
					`--docroot=${fixture.docroot}`,
					'--action=update',
					'--package=wpackagist-plugin/sample-plugin',
				],
				fixture.env,
			);

			const composerLog = readFileSync(fixture.composerLog, 'utf8');
			expect(composerLog).toContain(`PHP_BINARY=${phpBinary}`);
			expect(composerLog).toContain('ALLOW=1');
			expect(composerLog).toContain(
				'ARGS:update wpackagist-plugin/sample-plugin --no-interaction --no-dev -W',
			);
		} finally {
			fixture.cleanup();
		}
	});

	it('passes custom plugin Composer work through PHP-based composer launchers', () => {
		const fixture = makeFixture('php');
		try {
			const phpBinary = execFileSync('php', ['-r', 'echo PHP_BINARY;'], {
				encoding: 'utf8',
			});

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

			const composerLog = readFileSync(fixture.composerLog, 'utf8');
			expect(composerLog).toContain(`PHP_BINARY=${phpBinary}`);
			expect(composerLog).toContain(
				'ARGS:update satusdev/repo-fetcher --no-dev --no-interaction -W',
			);
		} finally {
			fixture.cleanup();
		}
	});

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

			expect(composerJson.require['satusdev/repo-fetcher']).toBe(
				'dev-main',
			);
			expect(composerJson.extra['use-symlinks']).toBe(false);
			expect(composerJson.config['allow-plugins']['satusdev/repo-fetcher']).toBe(true);
			expect(composerJson.config['allow-plugins']['satusdev/monorepo-fetcher']).toBe(true);
			expect(source).toMatchObject({
				type: 'plugin',
				url: 'https://github.com/satusdev/wp-secure-guard.git',
				path: '.',
				target: 'web/app/plugins',
				require: [
					{
						src: '.',
						as: 'wp-secure-guard',
					},
				],
			});
			expect(composerLog).toContain('ALLOW=1');
			expect(composerLog).toContain('NOINT=1');
			expect(composerLog).toContain(
				'ARGS:update satusdev/repo-fetcher --no-dev --no-interaction -W',
			);
			expect(composerLog).toContain(
				'ARGS:install --no-dev --no-interaction',
			);
		} finally {
			fixture.cleanup();
		}
	});

	it('passes REPO_FETCHER_TOKEN to Composer when github-token is provided', () => {
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
					'--github-token=test-token-12345',
				],
				fixture.env,
			);

			const composerLog = readFileSync(fixture.composerLog, 'utf8');
			expect(composerLog).toContain('TOKEN=test-token-12345');
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
					require: [
						{
							src: '.',
							as: 'wp-secure-guard',
						},
					],
				},
			];
			writeFileSync(composerPath, JSON.stringify(composerJson, null, 2) + '\n');
			const pluginDir = join(
				fixture.projectDir,
				'web',
				'app',
				'plugins',
				'wp-secure-guard',
			);
			mkdirSync(pluginDir, { recursive: true });
			writeFileSync(join(pluginDir, 'wp-secure-guard.php'), '<?php');

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
			expect(existsSync(pluginDir)).toBe(false);
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

	it('cleans up repo-fetcher require and repositories VCS config when last source is removed', () => {
		const fixture = makeFixture();
		try {
			const composerPath = join(fixture.projectDir, 'composer.json');
			const composerJson = JSON.parse(readFileSync(composerPath, 'utf8'));

			composerJson.extra['use-symlinks'] = false;
			composerJson.extra['monorepo-sources'] = [
				{
					type: 'plugin',
					url: 'git@github.com:satusdev/wp-secure-guard.git',
					path: '.',
					target: 'web/app/plugins',
					require: ['wp-secure-guard'],
				},
			];
			composerJson.require['satusdev/repo-fetcher'] = 'dev-main';
			composerJson.require['satusdev/monorepo-fetcher'] = 'dev-main';
			composerJson.config = {
				'allow-plugins': {
					'satusdev/repo-fetcher': true,
					'satusdev/monorepo-fetcher': true,
				},
			};
			composerJson.repositories = [
				{
					type: 'vcs',
					url: 'https://github.com/satusdev/monorepo-fetcher',
				},
				{
					type: 'composer',
					url: 'https://wpackagist.org',
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
			expect(updated.extra['monorepo-sources']).toBeUndefined();
			expect(updated.extra['use-symlinks']).toBeUndefined();
			expect(updated.require['satusdev/repo-fetcher']).toBeUndefined();
			expect(updated.require['satusdev/monorepo-fetcher']).toBeUndefined();
			expect(updated.config).toBeUndefined();
			expect(updated.repositories).toEqual([
				{
					type: 'composer',
					url: 'https://wpackagist.org',
				},
			]);
		} finally {
			fixture.cleanup();
		}
	});

	it('deletes leftover custom plugin files even when source is already absent', () => {
		const fixture = makeFixture();
		try {
			const pluginDir = join(
				fixture.projectDir,
				'web',
				'app',
				'plugins',
				'wp-secure-guard',
			);
			mkdirSync(pluginDir, { recursive: true });
			writeFileSync(join(pluginDir, 'wp-secure-guard.php'), '<?php');

			const output = runPhp(
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

			expect(JSON.parse(output)).toMatchObject({ success: true });
			expect(existsSync(pluginDir)).toBe(false);
		} finally {
			fixture.cleanup();
		}
	});
});
