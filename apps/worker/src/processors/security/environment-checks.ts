import type { SecurityFinding } from '@bedrock-forge/shared';
import { makeFinding } from './scoring';

type Executor = {
	execute(
		cmd: string,
		opts?: { timeout?: number },
	): Promise<{ stdout: string; stderr: string; code: number }>;
};

// ─── WP_AUDIT ────────────────────────────────────────────────────────────────

export async function runWpAudit(
	exec: Executor,
	rootPath: string,
): Promise<SecurityFinding[]> {
	const findings: SecurityFinding[] = [];

	const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

	// 1. wp-config.php location and permissions
	const wpConfigCandidates = [
		`${rootPath}/wp-config.php`,
		`${rootPath}/web/wp-config.php`,
	];
	let wpConfigPath: string | null = null;

	for (const candidate of wpConfigCandidates) {
		const { stdout } = await exec.execute(
			`test -f ${q(candidate)} && echo found || echo missing`,
		);
		if (stdout.trim() === 'found') {
			wpConfigPath = candidate;
			break;
		}
	}

	if (!wpConfigPath) {
		findings.push(
			makeFinding(
				'medium',
				'WP_CONFIG',
				'wp-config.php not found',
				`Could not locate wp-config.php in ${rootPath} or ${rootPath}/web/`,
				{
					remediation: 'Verify the root_path is correct for this environment.',
				},
			),
		);
		return findings;
	}

	// Check permissions on wp-config.php
	const { stdout: statOut } = await exec.execute(
		`stat -c '%a' ${q(wpConfigPath)} 2>/dev/null || true`,
	);
	const perms = statOut.trim();
	if (perms && !['400', '440', '444'].includes(perms)) {
		findings.push(
			makeFinding(
				perms === '666' || perms === '777' ? 'critical' : 'high',
				'FILE_PERMISSIONS',
				`wp-config.php has insecure permissions: ${perms}`,
				'wp-config.php contains database credentials and should be readable only by the web server user.',
				{
					remediation: `chmod 440 ${wpConfigPath}`,
					resource: wpConfigPath,
					metadata: { current_permissions: perms },
				},
			),
		);
	}

	// Read wp-config.php content for analysis
	const { stdout: wpConfigContent } = await exec.execute(
		`cat ${q(wpConfigPath)} 2>/dev/null | head -200 || true`,
	);

	// 2. WP_DEBUG enabled on production
	if (/define\s*\(\s*['"]WP_DEBUG['"]\s*,\s*true/i.test(wpConfigContent)) {
		findings.push(
			makeFinding(
				'high',
				'WP_CONFIG',
				'WP_DEBUG is enabled',
				'Debug mode exposes error details, PHP notices, and stack traces to visitors — a significant information disclosure risk.',
				{
					remediation: `Set define('WP_DEBUG', false) in ${wpConfigPath}`,
					resource: wpConfigPath,
				},
			),
		);
	}

	// 3. table_prefix = 'wp_' (default — easy to target in SQL injection)
	if (/\$table_prefix\s*=\s*['"]wp_['"]/i.test(wpConfigContent)) {
		findings.push(
			makeFinding(
				'medium',
				'WP_CONFIG',
				"Default WordPress table prefix 'wp_' in use",
				'The default wp_ prefix is well-known and aids automated SQL injection attacks.',
				{
					remediation:
						'Change the table prefix in wp-config.php and rename all tables in the database. ' +
						'Use a tool like Better Search Replace or manual SQL.',
					resource: wpConfigPath,
				},
			),
		);
	}

	// 4. AUTH_KEY / SECURE_AUTH_KEY length (should be 60+ chars)
	const saltMatches = wpConfigContent.match(
		/define\s*\(\s*['"]AUTH_KEY['"]\s*,\s*['"](.+?)['"]/,
	);
	if (saltMatches && saltMatches[1].length < 20) {
		findings.push(
			makeFinding(
				'high',
				'WP_CONFIG',
				'Weak or default WordPress secret keys',
				'WordPress authentication keys/salts are too short or appear to be placeholder values.',
				{
					remediation:
						'Generate strong keys at https://api.wordpress.org/secret-key/1.1/salt/ and update wp-config.php.',
					resource: wpConfigPath,
				},
			),
		);
	}

	// 5. PHP version check
	const { stdout: phpVersion } = await exec.execute(
		`php -r "echo PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION;" 2>/dev/null || true`,
	);
	const version = phpVersion.trim();
	if (version) {
		const [major, minor] = version.split('.').map(Number);
		if (major < 8 || (major === 8 && minor < 1)) {
			findings.push(
				makeFinding(
					major < 7 ? 'critical' : 'high',
					'PHP_CONFIG',
					`PHP ${version} is outdated`,
					`PHP ${version} has reached end-of-life and no longer receives security updates.`,
					{
						remediation: 'Upgrade to PHP 8.2 or higher.',
						metadata: { php_version: version },
					},
				),
			);
		}
	}

	// 6. Dangerous PHP ini settings
	const { stdout: phpIni } = await exec.execute(
		`php -r "echo json_encode(['display_errors'=>ini_get('display_errors'),'allow_url_fopen'=>ini_get('allow_url_fopen'),'allow_url_include'=>ini_get('allow_url_include')]);" 2>/dev/null || true`,
	);
	try {
		const ini = JSON.parse(phpIni.trim()) as Record<string, string>;
		if (
			ini['display_errors'] &&
			ini['display_errors'] !== '' &&
			ini['display_errors'] !== '0'
		) {
			findings.push(
				makeFinding(
					'medium',
					'PHP_CONFIG',
					'PHP display_errors is enabled',
					'Displaying errors in production leaks stack traces and path information to potential attackers.',
					{ remediation: 'Set display_errors = Off in php.ini or .user.ini' },
				),
			);
		}
		if (ini['allow_url_include'] === '1' || ini['allow_url_include'] === 'On') {
			findings.push(
				makeFinding(
					'high',
					'PHP_CONFIG',
					'PHP allow_url_include is enabled',
					'allow_url_include enables remote file inclusion (RFI) attacks, a common malware entry point.',
					{ remediation: 'Set allow_url_include = Off in php.ini' },
				),
			);
		}
	} catch {
		// PHP not available or JSON parse error — skip
	}

	// 7. WP admin users
	const { stdout: wpCliCheck } = await exec.execute(
		`which wp 2>/dev/null && echo found || echo missing`,
	);
	if (wpCliCheck.trim() === 'found') {
		const { stdout: adminUsers } = await exec.execute(
			`wp user list --role=administrator --fields=ID,user_login,user_email,user_registered --format=json --path=${q(rootPath)} 2>/dev/null || true`,
			{ timeout: 30000 },
		);
		try {
			const users = JSON.parse(adminUsers.trim()) as {
				ID: number;
				user_login: string;
				user_email: string;
				user_registered: string;
			}[];

			if (users.length > 0) {
				// Flag users registered within last 7 days
				const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
				const recentAdmins = users.filter(
					u => new Date(u.user_registered) > recentCutoff,
				);
				if (recentAdmins.length > 0) {
					findings.push(
						makeFinding(
							'critical',
							'WP_USERS',
							`${recentAdmins.length} new WordPress admin account(s) created in the last 7 days`,
							`New admins: ${recentAdmins.map(u => `${u.user_login} (${u.user_email})`).join(', ')}`,
							{
								remediation:
									'Immediately verify these accounts are legitimate. ' +
									'If unknown, delete them and change all admin passwords.',
								metadata: {
									new_admins: recentAdmins.map(u => ({
										login: u.user_login,
										email: u.user_email,
										registered: u.user_registered,
									})),
									all_admin_count: users.length,
								},
							},
						),
					);
				}

				if (users.length > 5) {
					findings.push(
						makeFinding(
							'medium',
							'WP_USERS',
							`${users.length} WordPress administrator accounts`,
							'A high number of admin accounts increases the attack surface.',
							{
								remediation:
									'Review all admin accounts. Downgrade inactive or unnecessary admins to a lower role.',
								metadata: {
									admins: users.map(u => ({
										login: u.user_login,
										email: u.user_email,
									})),
								},
							},
						),
					);
				} else {
					findings.push(
						makeFinding(
							'info',
							'WP_USERS',
							`${users.length} WordPress administrator account(s)`,
							`Admin users: ${users.map(u => u.user_login).join(', ')}`,
							{
								metadata: {
									admins: users.map(u => ({
										login: u.user_login,
										email: u.user_email,
									})),
								},
							},
						),
					);
				}
			}
		} catch {
			// WP-CLI not available or not a WordPress install
		}
	}

	// 8. Retrieve site URL for HTTP-based checks (WP_CLI preferred, fallback grep)
	let siteUrl = '';
	try {
		const { stdout: urlFromCli } = await exec.execute(
			`wp option get siteurl --path=${q(rootPath)} --skip-themes --skip-plugins 2>/dev/null || true`,
			{ timeout: 15000 },
		);
		siteUrl = urlFromCli.trim();
	} catch {
		// WP CLI not available — try reading from wp-config
		if (wpConfigContent) {
			const match =
				wpConfigContent.match(
					/define\s*\(\s*['"]WP_HOME['"]\s*,\s*['"]([^'"]+)['"]/i,
				) ??
				wpConfigContent.match(
					/define\s*\(\s*['"]WP_SITEURL['"]\s*,\s*['"]([^'"]+)['"]/i,
				);
			if (match) siteUrl = match[1].trim();
		}
	}

	if (siteUrl && siteUrl.startsWith('http')) {
		const cleanUrl = siteUrl.replace(/\/$/, '');

		// xmlrpc.php exposed — common DDoS amplification and brute-force vector
		const { stdout: xmlrpcCode } = await exec.execute(
			`curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${cleanUrl}/xmlrpc.php" 2>/dev/null || echo 000`,
			{ timeout: 15000 },
		);
		if (xmlrpcCode.trim() === '200') {
			findings.push(
				makeFinding(
					'high',
					'WP_CONFIG',
					'xmlrpc.php is publicly accessible',
					'XML-RPC allows brute-force login bypassing standard rate limiting. It is also used for DDoS amplification.',
					{
						remediation:
							'Disable XML-RPC by adding to wp-config.php: add_filter("xmlrpc_enabled","__return_false"); ' +
							'Or block via .htaccess: <Files xmlrpc.php> deny from all </Files>',
						resource: `${cleanUrl}/xmlrpc.php`,
					},
				),
			);
		}

		// readme.html accessible — reveals WordPress version
		const { stdout: readmeCode } = await exec.execute(
			`curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${cleanUrl}/readme.html" 2>/dev/null || echo 000`,
			{ timeout: 15000 },
		);
		if (readmeCode.trim() === '200') {
			findings.push(
				makeFinding(
					'medium',
					'VERSION_DISCLOSURE',
					'WordPress readme.html is publicly accessible (version disclosure)',
					'readme.html reveals the WordPress version, enabling targeted version-specific exploits.',
					{
						remediation: `rm ${rootPath}/readme.html or block via nginx/Apache: deny access to readme.html`,
						resource: `${cleanUrl}/readme.html`,
					},
				),
			);
		}

		// wp-json user enumeration — leaks all usernames
		const { stdout: usersJson } = await exec.execute(
			`curl -s --max-time 10 "${cleanUrl}/wp-json/wp/v2/users" 2>/dev/null || echo '[]'`,
			{ timeout: 15000 },
		);
		try {
			const parsed = JSON.parse(usersJson.trim());
			if (Array.isArray(parsed) && parsed.length > 0) {
				const logins = (parsed as { slug?: string; name?: string }[])
					.map(u => u.slug ?? u.name ?? 'unknown')
					.slice(0, 10);
				findings.push(
					makeFinding(
						'medium',
						'VERSION_DISCLOSURE',
						`WordPress REST API exposes ${parsed.length} username(s)`,
						'The /wp-json/wp/v2/users endpoint reveals usernames publicly, aiding targeted brute-force attacks.',
						{
							remediation:
								'Add to functions.php or a security plugin: add_filter("rest_endpoints", function($e){ unset($e["/wp/v2/users"]); return $e; });',
							resource: `${cleanUrl}/wp-json/wp/v2/users`,
							metadata: { usernames: logins, total: parsed.length },
						},
					),
				);
			}
		} catch {
			// JSON parse error — endpoint might not be enabled
		}

		// .git directory exposed — full source code disclosure
		const { stdout: gitHeadCode } = await exec.execute(
			`curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${cleanUrl}/.git/HEAD" 2>/dev/null || echo 000`,
			{ timeout: 15000 },
		);
		if (gitHeadCode.trim() === '200') {
			findings.push(
				makeFinding(
					'high',
					'VERSION_DISCLOSURE',
					'.git directory is publicly accessible',
					'An exposed .git directory allows attackers to download the full source code, including credentials in commit history.',
					{
						remediation:
							'Block access via Nginx: location ~ /\\.git { deny all; } or Apache: <DirectoryMatch "^.*/\\.git"> deny from all </DirectoryMatch>',
						resource: `${cleanUrl}/.git/HEAD`,
					},
				),
			);
		}
	}

	// 9. timthumb.php — vulnerable image resizing script frequently exploited
	const { stdout: timthumbFiles } = await exec.execute(
		`find ${q(rootPath)} -type f \\( -name "timthumb.php" -o -name "thumb.php" \\) 2>/dev/null | head -10 || true`,
		{ timeout: 20000 },
	);
	const ttFiles = timthumbFiles
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);
	if (ttFiles.length > 0) {
		findings.push(
			makeFinding(
				'high',
				'SUSPICIOUS_FILES',
				`timthumb.php found in ${ttFiles.length} location(s)`,
				'timthumb.php is a legacy image resizer with multiple known RCE vulnerabilities (CVE-2011-4825 and others).',
				{
					remediation:
						'Delete timthumb.php. Update or replace any themes/plugins that depend on it.',
					metadata: { files: ttFiles },
				},
			),
		);
	}

	// 10. WordPress core file integrity — modified files outside wp-content indicate a breach
	const { stdout: coreModified } = await exec.execute(
		`find ${q(rootPath + '/wp-includes')} ${q(rootPath + '/wp-admin')} -name "*.php" -newer ${q(rootPath + '/wp-includes/version.php')} -type f 2>/dev/null | head -20 || true`,
		{ timeout: 30000 },
	);
	const modifiedCore = coreModified
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);
	if (modifiedCore.length > 0) {
		findings.push(
			makeFinding(
				'critical',
				'SUSPICIOUS_FILES',
				`${modifiedCore.length} WordPress core PHP file(s) modified after initial install`,
				'WordPress core files in wp-includes or wp-admin should never be modified. Changes indicate tampering or backdoor injection.',
				{
					remediation:
						'Re-download WordPress core files and compare with official release. ' +
						'Run: wp core verify-checksums --path=' +
						rootPath,
					metadata: { files: modifiedCore },
				},
			),
		);
	}

	return findings;
}

// ─── PROJECT_MALWARE ────────────────────────────────────────────────────────

export async function runProjectMalware(
	exec: Executor,
	rootPath: string,
): Promise<SecurityFinding[]> {
	const findings: SecurityFinding[] = [];
	const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

	// 1. PHP files in uploads (always critical)
	const { stdout: phpInUploads } = await exec.execute(
		`find ${q(rootPath)} -path "*/uploads/*.php" -type f 2>/dev/null | head -20 || true`,
		{ timeout: 30000 },
	);
	const phpFiles = phpInUploads
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);
	if (phpFiles.length > 0) {
		findings.push(
			makeFinding(
				'critical',
				'SUSPICIOUS_FILES',
				`${phpFiles.length} PHP file(s) in WordPress uploads directory`,
				'PHP files in /uploads/ are a definitive indicator of a webshell or injected malware.',
				{
					remediation:
						'Delete these files immediately. Block PHP execution in uploads via .htaccess.',
					metadata: { files: phpFiles },
				},
			),
		);
	}

	// 2. Pattern-based malware scan scoped to this environment
	const patterns: {
		name: string;
		pattern: string;
		severity: 'critical' | 'high';
	}[] = [
		{
			name: 'eval(base64_decode)',
			pattern: 'eval(base64_decode',
			severity: 'critical',
		},
		{
			name: 'gzinflate eval chain',
			pattern: 'gzinflate.*eval\\|eval.*gzinflate',
			severity: 'critical',
		},
		{
			name: 'c99/r57 webshell',
			pattern: 'FilesMan\\|c99shell\\|r57shell',
			severity: 'critical',
		},
		{
			name: 'assert(base64_decode)',
			pattern: 'assert.base64_decode',
			severity: 'high',
		},
		{
			name: 'POST execution',
			pattern: '\\$_POST.*eval\\|eval.*\\$_POST',
			severity: 'high',
		},
	];

	for (const { name, pattern, severity } of patterns) {
		const { stdout } = await exec.execute(
			`grep -rl "${pattern}" ${q(rootPath)} --include="*.php" 2>/dev/null | head -20 || true`,
			{ timeout: 60000 },
		);
		const matched = stdout
			.split('\n')
			.map(l => l.trim())
			.filter(Boolean);
		if (matched.length > 0) {
			findings.push(
				makeFinding(
					severity,
					'MALWARE',
					`${name} pattern found in ${matched.length} file(s)`,
					`Suspicious PHP code pattern detected.`,
					{
						remediation:
							'Inspect these files. If malicious, delete them and trace how they appeared.',
						metadata: { files: matched },
					},
				),
			);
		}
	}

	// 3. Recently modified PHP files (not in wp-admin / wp-includes)
	const { stdout: recentMod } = await exec.execute(
		`find ${q(rootPath)} -name "*.php" -mtime -7 -type f ` +
			`-not -path "*/wp-includes/*" -not -path "*/wp-admin/*" 2>/dev/null | head -50 || true`,
		{ timeout: 30000 },
	);
	const recentFiles = recentMod
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);
	if (recentFiles.length > 15) {
		findings.push(
			makeFinding(
				'medium',
				'SUSPICIOUS_FILES',
				`${recentFiles.length} non-core PHP files modified in the last 7 days`,
				'Widespread recent modifications to PHP files outside wp-core may indicate a mass injection.',
				{
					remediation:
						'Compare against a clean deployment to identify injected code.',
					metadata: { files: recentFiles.slice(0, 30) },
				},
			),
		);
	} else if (recentFiles.length > 0) {
		findings.push(
			makeFinding(
				'info',
				'SUSPICIOUS_FILES',
				`${recentFiles.length} non-core PHP file(s) modified recently`,
				'Review to confirm changes are expected (plugin updates, custom code, etc.).',
				{ metadata: { files: recentFiles } },
			),
		);
	}

	// 4. .htaccess injection scoped to this environment
	const { stdout: htaccessMatches } = await exec.execute(
		`find ${q(rootPath)} -name ".htaccess" -exec grep -lE "eval|base64_decode|RewriteRule.*https?://" {} \\; 2>/dev/null | head -10 || true`,
		{ timeout: 30000 },
	);
	const htFiles = htaccessMatches
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);
	if (htFiles.length > 0) {
		findings.push(
			makeFinding(
				'critical',
				'HTACCESS',
				`Malicious .htaccess content detected in ${htFiles.length} file(s)`,
				'.htaccess files with eval/base64 or unauthorized rewrites indicate active malware injection.',
				{
					remediation:
						'Inspect each .htaccess file. Remove injected lines. Check for the source (compromised plugin or theme).',
					metadata: { files: htFiles },
				},
			),
		);
	}

	// 5. PHP files in non-standard image directories (images/, img/, etc.)
	const { stdout: phpInImgDirs } = await exec.execute(
		`find ${q(rootPath)} -type f -name "*.php" \\( -path "*/images/*" -o -path "*/img/*" -o -path "*/thumbnails/*" \\) 2>/dev/null | head -15 || true`,
		{ timeout: 20000 },
	);
	const imgPhpFiles = phpInImgDirs
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);
	if (imgPhpFiles.length > 0) {
		findings.push(
			makeFinding(
				'critical',
				'SUSPICIOUS_FILES',
				`${imgPhpFiles.length} PHP file(s) found in image directories`,
				'PHP scripts in image directories are a common webshell placement — attackers upload disguised PHP as images.',
				{
					remediation:
						'Delete these files. Add PHP execution denial to image directories via .htaccess: php_flag engine off',
					metadata: { files: imgPhpFiles },
				},
			),
		);
	}

	// 6. Reverse shell patterns in project PHP files
	const reverseShellPatterns = [
		{ name: 'bash reverse shell (/dev/tcp)', pattern: '/dev/tcp/' },
		{ name: 'Python pty.spawn', pattern: 'import pty.*spawn\\|pty\\.spawn' },
	];
	for (const { name, pattern } of reverseShellPatterns) {
		const { stdout: rsMatches } = await exec.execute(
			`grep -rl "${pattern}" ${q(rootPath)} --include="*.php" 2>/dev/null | head -10 || true`,
			{ timeout: 30000 },
		);
		const rsFiles = rsMatches
			.split('\n')
			.map(l => l.trim())
			.filter(Boolean);
		if (rsFiles.length > 0) {
			findings.push(
				makeFinding(
					'critical',
					'REVERSE_SHELL',
					`Reverse shell pattern detected: ${name}`,
					`Found ${rsFiles.length} PHP file(s) with reverse shell pattern — active backdoor indicator.`,
					{
						remediation:
							'Delete these files immediately. Rotate all server credentials. ' +
							'Investigate attack vector (outdated plugin, weak FTP password, etc.)',
						metadata: { files: rsFiles },
					},
				),
			);
		}
	}

	return findings;
}
