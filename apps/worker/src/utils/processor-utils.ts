import { RemoteExecutorService } from '@bedrock-forge/remote-executor';
import { StepTracker } from '../services/step-tracker';

/**
 * Wrap a string in single quotes for safe shell embedding.
 * Single quotes inside the value are escaped as: ' -> '\''
 */
export function shellQuote(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}

/**
 * Flip http↔https on a URL string.
 * Returns null if the URL doesn't start with http:// or https://.
 */
export function flipProtocol(url: string): string | null {
	if (url.startsWith('https://')) return 'http://' + url.slice(8);
	if (url.startsWith('http://')) return 'https://' + url.slice(7);
	return null;
}

/**
 * Fix CyberPanel file ownership on a remote docroot.
 *
 * CyberPanel assigns each website a dedicated system user and expects:
 *   - The docroot folder itself  →  user:nogroup  mode 750  (drwxr-x---)
 *   - All files/dirs inside       →  user:user     (recursive)
 *
 * Detection: stat the parent of rootPath (e.g. /home/<domain>) to find the
 * site owner, then fall back to stat on rootPath itself if the parent is
 * root-owned or unreadable. Skips silently when no non-root owner is found.
 */
export async function fixCyberPanelOwnership(
	executor: RemoteExecutorService,
	rootPath: string,
	tracker?: StepTracker,
): Promise<void> {
	const root = rootPath.replace(/\/+$/, '');
	const parentDir = root.replace(/\/[^/]+$/, '');

	const log = async (
		step: string,
		level: 'info' | 'warn',
		detail?: string,
	): Promise<void> => {
		if (tracker) {
			await tracker.track({ step, level, detail }).catch(() => undefined);
		}
	};

	// Detect the site owner from the parent directory (e.g. /home/<domain>)
	const parentStat = await executor
		.execute(`stat -c '%U' ${shellQuote(parentDir)} 2>/dev/null`)
		.catch(() => ({ code: 1, stdout: '', stderr: '' }));
	let owner: string | null =
		parentStat.code === 0 &&
		parentStat.stdout.trim() &&
		parentStat.stdout.trim() !== 'root'
			? parentStat.stdout.trim()
			: null;

	// Fallback: stat the docroot itself when parent is root-owned or unreadable
	if (!owner) {
		const selfStat = await executor
			.execute(`stat -c '%U' ${shellQuote(root)} 2>/dev/null`)
			.catch(() => ({ code: 1, stdout: '', stderr: '' }));
		if (
			selfStat.code === 0 &&
			selfStat.stdout.trim() &&
			selfStat.stdout.trim() !== 'root'
		) {
			owner = selfStat.stdout.trim();
		}
	}

	if (!owner) {
		await log(
			'Could not detect site owner — skipping ownership fix',
			'warn',
			`root=${root}`,
		);
		return;
	}

	await log(
		`Fixing ownership: ${owner}:${owner} (recursive) then ${owner}:nogroup on docroot`,
		'info',
		root,
	);

	// Step 1 — inner files: user:user (recursive)
	await executor
		.execute(`chown -R ${shellQuote(`${owner}:${owner}`)} ${shellQuote(root)}`)
		.catch(async (e: unknown) => {
			await log(
				'chown -R failed — inner files may have wrong ownership',
				'warn',
				e instanceof Error ? e.message : String(e),
			);
		});

	// Step 2 — docroot folder itself: user:nogroup (non-recursive override)
	await executor
		.execute(`chown ${shellQuote(`${owner}:nogroup`)} ${shellQuote(root)}`)
		.catch(async (e: unknown) => {
			await log(
				'chown user:nogroup on docroot failed',
				'warn',
				e instanceof Error ? e.message : String(e),
			);
		});

	// Step 3 — enforce correct mode on the docroot
	await executor
		.execute(`chmod 750 ${shellQuote(root)}`)
		.catch(async (e: unknown) => {
			await log(
				'chmod 750 on docroot failed',
				'warn',
				e instanceof Error ? e.message : String(e),
			);
		});

	await log(
		`Ownership fixed: ${owner}:nogroup on docroot, ${owner}:${owner} on contents`,
		'info',
	);
}

/**
 * Detect the owner of a WordPress installation directory and return the
 * appropriate WP-CLI invocation prefix.
 *
 * On CyberPanel (and similar panel stacks) each site runs under its own Linux
 * user whose PHP-FPM pool has all required extensions (mysqli, etc.). Root's
 * CLI PHP (/usr/bin/php) is often a minimal build that lacks those extensions,
 * causing WP-CLI to fail with "missing MySQL extension" when invoked as root.
 *
 * Returns:
 *   Non-root owner → `{ prefix: 'sudo -u <owner>', allowRootFlag: '' }`
 *   Root-owned or stat failure → `{ prefix: '', allowRootFlag: '--allow-root' }`
 *   CyberPanel/OLS host → `lsphpBin` = lowest-version lsphp path with mysqli,
 *                          `wpBin`    = absolute path to wp phar/binary.
 *   When both are set, callers should invoke: `${prefix} ${lsphpBin} ${wpBin} args`
 *   to bypass the phar shebang entirely. If only `lsphpBin` is set (wp not found
 *   in PATH), fall back to `env WP_CLI_PHP=${lsphpBin} wp`.
 */
export async function buildWpCliPrefix(
	executor: RemoteExecutorService,
	wpPath: string,
): Promise<{
	prefix: string;
	allowRootFlag: string;
	lsphpBin: string | null;
	wpBin: string | null;
}> {
	let prefix = '';
	let allowRootFlag = '--allow-root';
	try {
		const r = await executor.execute(
			`stat -c '%U' ${shellQuote(wpPath)} 2>/dev/null`,
		);
		const owner = r.stdout.trim();
		// Accept only valid unix usernames — reject anything with shell metacharacters
		if (
			owner &&
			owner !== 'root' &&
			/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(owner)
		) {
			prefix = `sudo -u ${owner}`;
			allowRootFlag = '';
		}
	} catch {
		// stat failed — proceed with --allow-root
	}
	// Detect LiteSpeed PHP binary and WP-CLI path for direct phar invocation.
	// On CyberPanel, system PHP (/usr/bin/php) often lacks mysqli; lsphpXX does not.
	// When wp is installed as a PHP Phar (common on CyberPanel), WP_CLI_PHP env var
	// is silently ignored because the Phar shebang (#!/usr/bin/env php) is hardcoded.
	// The only reliable fix is to call:  lsphpXX /path/to/wp.phar args
	let lsphpBin: string | null = null;
	let wpBin: string | null = null;
	try {
		const lsphpResult = await executor.execute(
			`ls /usr/local/lsws/lsphp*/bin/php 2>/dev/null | sort -V | head -1`,
		);
		const bin = lsphpResult.stdout.trim();
		// Strict path validation — only accept canonical CyberPanel/OpenLiteSpeed paths
		if (bin && /^\/usr\/local\/lsws\/lsphp\d+\/bin\/php$/.test(bin)) {
			lsphpBin = bin;
		}
	} catch {
		// lsphp not found — proceed without PHP override
	}
	if (lsphpBin) {
		try {
			const wpResult = await executor.execute(`which wp 2>/dev/null`);
			const bin = wpResult.stdout.trim();
			// Strict path validation — only absolute paths, no metacharacters
			if (bin && /^\/[a-zA-Z0-9_.\/-]+$/.test(bin)) {
				wpBin = bin;
			}
		} catch {
			// wp not in PATH — lsphpBin alone will be used with WP_CLI_PHP fallback
		}
	}
	return { prefix, allowRootFlag, lsphpBin, wpBin };
}
