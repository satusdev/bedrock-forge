import type { SecurityFinding } from '@bedrock-forge/shared';
import { makeFinding } from './scoring';

type Executor = {
	execute(
		cmd: string,
		opts?: { timeout?: number },
	): Promise<{ stdout: string; stderr: string; code: number }>;
};

// ─── SSH_AUDIT ────────────────────────────────────────────────────────────────

export async function runSshAudit(exec: Executor): Promise<SecurityFinding[]> {
	const findings: SecurityFinding[] = [];

	// 1. Collect authorized_keys for root and all home users
	const { stdout: authKeysRoot } = await exec.execute(
		`cat /root/.ssh/authorized_keys 2>/dev/null || true`,
	);
	const { stdout: homeUsers } = await exec.execute(
		`ls /home 2>/dev/null || true`,
	);

	const users = homeUsers
		.split('\n')
		.map(u => u.trim())
		.filter(Boolean);
	const allKeyFiles: { path: string; content: string }[] = [];

	if (authKeysRoot.trim()) {
		allKeyFiles.push({
			path: '/root/.ssh/authorized_keys',
			content: authKeysRoot,
		});
	}
	for (const user of users) {
		const { stdout } = await exec.execute(
			`cat /home/${user}/.ssh/authorized_keys 2>/dev/null || true`,
		);
		if (stdout.trim()) {
			allKeyFiles.push({
				path: `/home/${user}/.ssh/authorized_keys`,
				content: stdout,
			});
		}
	}

	for (const { path, content } of allKeyFiles) {
		const keys = content
			.split('\n')
			.map(l => l.trim())
			.filter(l => l && !l.startsWith('#'));

		if (keys.length > 3) {
			findings.push(
				makeFinding(
					'medium',
					'AUTHORIZED_KEYS',
					`${keys.length} authorized keys found in ${path}`,
					`Large number of authorized SSH keys detected. Review each key to ensure they are all legitimate.`,
					{
						remediation:
							'Remove any unrecognised or stale public keys from the authorized_keys file.',
						resource: path,
						metadata: { key_count: keys.length },
					},
				),
			);
		} else if (keys.length > 0) {
			findings.push(
				makeFinding(
					'info',
					'AUTHORIZED_KEYS',
					`${keys.length} authorized key(s) in ${path}`,
					`${path} contains ${keys.length} public key(s). Verify they are all known and expected.`,
					{
						remediation:
							'Periodically audit authorized_keys to remove stale access.',
						resource: path,
						metadata: { key_count: keys.length },
					},
				),
			);
		}
	}

	// 2. Parse auth log for failed and successful logins
	const authLogFile = await resolveAuthLog(exec);

	if (authLogFile) {
		const { stdout: failedRaw } = await exec.execute(
			`grep -i "Failed password\\|Invalid user" ${authLogFile} 2>/dev/null | tail -2000 || true`,
			{ timeout: 30000 },
		);

		const failedByIp: Record<string, number> = {};
		for (const line of failedRaw.split('\n').filter(Boolean)) {
			const ipMatch = line.match(/from (\d+\.\d+\.\d+\.\d+)/);
			if (ipMatch) {
				const ip = ipMatch[1];
				failedByIp[ip] = (failedByIp[ip] ?? 0) + 1;
			}
		}

		const bruteForceIps = Object.entries(failedByIp).filter(
			([, count]) => count >= 10,
		);
		const highVolumeIps = Object.entries(failedByIp).filter(
			([, count]) => count >= 50,
		);

		if (highVolumeIps.length > 0) {
			findings.push(
				makeFinding(
					'critical',
					'FAILED_LOGINS',
					`Brute-force SSH attack detected from ${highVolumeIps.length} IP(s)`,
					`IP(s) with 50+ failed login attempts: ${highVolumeIps.map(([ip, n]) => `${ip} (${n})`).join(', ')}`,
					{
						remediation:
							'Block these IPs with ufw/iptables immediately. Enable fail2ban. ' +
							'Consider disabling password authentication entirely (PasswordAuthentication no in sshd_config).',
						resource: highVolumeIps.map(([ip]) => ip).join(', '),
						metadata: { ips: Object.fromEntries(highVolumeIps) },
					},
				),
			);
		} else if (bruteForceIps.length > 0) {
			findings.push(
				makeFinding(
					'high',
					'FAILED_LOGINS',
					`Repeated SSH login failures from ${bruteForceIps.length} IP(s)`,
					`IP(s) with 10+ failed attempts: ${bruteForceIps.map(([ip, n]) => `${ip} (${n})`).join(', ')}`,
					{
						remediation:
							'Review these IPs and block malicious ones. Enable fail2ban if not active.',
						resource: bruteForceIps.map(([ip]) => ip).join(', '),
						metadata: { ips: Object.fromEntries(bruteForceIps) },
					},
				),
			);
		} else if (Object.keys(failedByIp).length > 0) {
			findings.push(
				makeFinding(
					'low',
					'FAILED_LOGINS',
					`SSH login failures from ${Object.keys(failedByIp).length} IP(s)`,
					`Low-level failed login activity observed.`,
					{
						remediation:
							'Monitor trends. Enable fail2ban for automated blocking.',
						metadata: { ips: failedByIp },
					},
				),
			);
		}

		// Successful logins
		const { stdout: successRaw } = await exec.execute(
			`grep -i "Accepted publickey\\|Accepted password" ${authLogFile} 2>/dev/null | tail -500 || true`,
			{ timeout: 15000 },
		);

		const successByIp: Record<string, { count: number; users: Set<string> }> =
			{};
		for (const line of successRaw.split('\n').filter(Boolean)) {
			const ipMatch = line.match(/from (\d+\.\d+\.\d+\.\d+)/);
			const userMatch = line.match(/for (\S+) from/);
			if (ipMatch) {
				const ip = ipMatch[1];
				const user = userMatch?.[1] ?? 'unknown';
				if (!successByIp[ip]) successByIp[ip] = { count: 0, users: new Set() };
				successByIp[ip].count++;
				successByIp[ip].users.add(user);
			}
		}

		if (Object.keys(successByIp).length > 0) {
			findings.push(
				makeFinding(
					'info',
					'SUCCESSFUL_LOGINS',
					`SSH logins from ${Object.keys(successByIp).length} distinct IP(s)`,
					`Recent successful SSH logins detected. Review login sources.`,
					{
						remediation:
							'Verify all source IPs are expected. Remove any legacy accounts.',
						metadata: {
							ips: Object.fromEntries(
								Object.entries(successByIp).map(([ip, v]) => [
									ip,
									{ count: v.count, users: [...v.users] },
								]),
							),
						},
					},
				),
			);
		}
	}

	// 3. SSH host key file permissions — should be 600
	const { stdout: hostKeyPerms } = await exec.execute(
		`find /etc/ssh -name "ssh_host_*_key" -not -name "*.pub" -exec stat -c '%n %a' {} \\; 2>/dev/null || true`,
	);
	for (const line of hostKeyPerms.split('\n').filter(Boolean)) {
		const parts = line.trim().split(' ');
		if (parts.length >= 2) {
			const keyPath = parts.slice(0, -1).join(' ');
			const perm = parts[parts.length - 1];
			if (perm !== '600') {
				findings.push(
					makeFinding(
						'high',
						'SSH_CONFIG',
						`SSH host key has insecure permissions: ${keyPath} (${perm})`,
						'Host private keys should be readable only by root (600).',
						{
							remediation: `chmod 600 ${keyPath}`,
							resource: keyPath,
							metadata: { permissions: perm },
						},
					),
				);
			}
		}
	}

	// 4. .ssh directory permissions for root and home users — should be 700
	const dirsToCheck: string[] = ['/root/.ssh'];
	const { stdout: homeDirs } = await exec.execute(`ls /home 2>/dev/null || true`);
	for (const u of homeDirs.split('\n').map(l => l.trim()).filter(Boolean)) {
		dirsToCheck.push(`/home/${u}/.ssh`);
	}
	for (const dir of dirsToCheck) {
		const { stdout: dirPerm } = await exec.execute(
			`stat -c '%a' ${dir} 2>/dev/null || true`,
		);
		const perm = dirPerm.trim();
		if (perm && perm !== '700') {
			findings.push(
				makeFinding(
					'medium',
					'SSH_CONFIG',
					`${dir} has insecure permissions: ${perm}`,
					'.ssh directories should be 700 to prevent other users reading authorized_keys.',
					{
						remediation: `chmod 700 ${dir}`,
						resource: dir,
						metadata: { permissions: perm },
					},
				),
			);
		}
	}

	// 5. sshd_config analysis
	try {
		const { stdout: sshdRaw } = await exec.execute(
			`cat /etc/ssh/sshd_config 2>/dev/null || true`,
		);
		const configLines = sshdRaw
			.split('\n')
			.map(l => l.trim())
			.filter(l => l && !l.startsWith('#'));

		const getValue = (key: string): string | null => {
			const line = configLines.find(l =>
				l.toLowerCase().startsWith(key.toLowerCase()),
			);
			return line ? line.split(/\s+/)[1] ?? null : null;
		};

		const permitRootLogin = getValue('PermitRootLogin');
		if (permitRootLogin !== 'no') {
			findings.push(
				makeFinding(
					'critical',
					'SSH_CONFIG',
					'PermitRootLogin is enabled',
					`sshd_config allows direct root login${permitRootLogin === null ? ' (not explicitly disabled)' : ''}.`,
					{
						remediation:
							'Set "PermitRootLogin no" in /etc/ssh/sshd_config and reload: systemctl reload sshd',
						resource: '/etc/ssh/sshd_config',
					},
				),
			);
		}

		const passwordAuth = getValue('PasswordAuthentication');
		if (passwordAuth === 'yes' || passwordAuth === null) {
			findings.push(
				makeFinding(
					'high',
					'SSH_CONFIG',
					'Password authentication is enabled',
					'SSH allows password-based logins, enabling brute-force attacks.',
					{
						remediation:
							'Set "PasswordAuthentication no" to require key-based auth only. ' +
							'Ensure all admin SSH keys are in authorized_keys first.',
						resource: '/etc/ssh/sshd_config',
					},
				),
			);
		}

		const maxAuthTries = parseInt(getValue('MaxAuthTries') ?? '6', 10);
		if (maxAuthTries > 3) {
			findings.push(
				makeFinding(
					'medium',
					'SSH_CONFIG',
					`MaxAuthTries is set to ${maxAuthTries}`,
					'High MaxAuthTries gives attackers more attempts per connection before being disconnected.',
					{
						remediation: 'Set "MaxAuthTries 3" in /etc/ssh/sshd_config.',
						resource: '/etc/ssh/sshd_config',
					},
				),
			);
		}

		const x11 = getValue('X11Forwarding');
		if (x11 === 'yes') {
			findings.push(
				makeFinding(
					'low',
					'SSH_CONFIG',
					'X11Forwarding is enabled',
					'X11 forwarding is unnecessary on headless servers and widens the attack surface.',
					{
						remediation: 'Set "X11Forwarding no" in /etc/ssh/sshd_config.',
						resource: '/etc/ssh/sshd_config',
					},
				),
			);
		}

		// AllowUsers / AllowGroups not set means any valid user can log in via SSH
		const allowUsers = getValue('AllowUsers');
		const allowGroups = getValue('AllowGroups');
		if (!allowUsers && !allowGroups) {
			findings.push(
				makeFinding(
					'medium',
					'SSH_CONFIG',
					'AllowUsers / AllowGroups not configured in sshd_config',
					'Without AllowUsers or AllowGroups, any valid system user can attempt SSH login.',
					{
						remediation:
							'Add "AllowUsers root deploy" (or a specific group via AllowGroups) to /etc/ssh/sshd_config and reload sshd.',
						resource: '/etc/ssh/sshd_config',
					},
				),
			);
		}

		// AuthenticationMethods should be publickey only
		const authMethods = getValue('AuthenticationMethods');
		if (authMethods && authMethods !== 'publickey') {
			findings.push(
				makeFinding(
					'high',
					'SSH_CONFIG',
					`AuthenticationMethods is set to "${authMethods}" instead of publickey`,
					'Allowing non-publickey authentication methods enables password-based brute-force.',
					{
						remediation:
							'Set "AuthenticationMethods publickey" in /etc/ssh/sshd_config.',
						resource: '/etc/ssh/sshd_config',
					},
				),
			);
		}
	} catch {
		// sshd_config unreadable — not a local permission issue we can fix
	}

	// 6. Open ports
	try {
		const { stdout: netstatOut } = await exec.execute(
			`ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || true`,
			{ timeout: 10000 },
		);

		const knownPorts = new Set([22, 80, 443, 3306, 5432, 6379, 8080, 8443, 8888]);
		const openPorts: number[] = [];

		for (const line of netstatOut.split('\n').filter(Boolean)) {
			const match = line.match(/:(\d+)\s/);
			if (match) {
				const port = parseInt(match[1], 10);
				if (!isNaN(port) && !knownPorts.has(port) && port < 65535) {
					if (!openPorts.includes(port)) openPorts.push(port);
				}
			}
		}

		if (openPorts.length > 5) {
			findings.push(
				makeFinding(
					'medium',
					'OPEN_PORTS',
					`${openPorts.length} unexpected open port(s)`,
					`Ports open beyond standard: ${openPorts.slice(0, 20).join(', ')}${openPorts.length > 20 ? ', ...' : ''}`,
					{
						remediation:
							'Review all open ports and close any that are not required. ' +
							'Use ufw to restrict port access.',
						metadata: { ports: openPorts },
					},
				),
			);
		} else if (openPorts.length > 0) {
			findings.push(
				makeFinding(
					'info',
					'OPEN_PORTS',
					`${openPorts.length} additional open port(s)`,
					`Non-standard ports open: ${openPorts.join(', ')}`,
					{
						remediation: 'Confirm each port is intentional.',
						metadata: { ports: openPorts },
					},
				),
			);
		}
	} catch {
		// ss/netstat unavailable
	}

	return findings;
}

// ─── SERVER_HARDENING ─────────────────────────────────────────────────────────

export async function runServerHardening(
	exec: Executor,
): Promise<SecurityFinding[]> {
	const findings: SecurityFinding[] = [];

	// 1. Firewall status
	const { stdout: ufwStatus } = await exec.execute(
		`ufw status 2>/dev/null || true`,
	);
	const { stdout: csfCheck } = await exec.execute(
		`csf -v 2>/dev/null | head -1 || echo missing`,
		{ timeout: 10000 },
	);

	if (!csfCheck.includes('missing')) {
		// CSF is present
		const { stdout: csfTesting } = await exec.execute(
			`grep -E "^TESTING\\s*=" /etc/csf/csf.conf 2>/dev/null | grep -c "1" || echo 0`,
		);
		if (parseInt(csfTesting.trim(), 10) > 0) {
			findings.push(
				makeFinding(
					'high',
					'FIREWALL',
					'CSF is in TESTING mode — firewall rules are not being enforced',
					'CSF TESTING=1 means DROP rules are not applied. The firewall is effectively disabled.',
					{
						remediation:
							'Edit /etc/csf/csf.conf: set TESTING = "0", then run: csf -r',
					},
				),
			);
		}
	} else if (
		ufwStatus.toLowerCase().includes('inactive') ||
		!ufwStatus.trim()
	) {
		const { stdout: iptables } = await exec.execute(
			`iptables -L INPUT -n 2>/dev/null | wc -l || true`,
		);
		const ruleCount = parseInt(iptables.trim(), 10);
		if (!iptables.trim() || ruleCount <= 3) {
			findings.push(
				makeFinding(
					'high',
					'FIREWALL',
					'No active firewall detected',
					'Neither ufw nor iptables appears to be actively filtering inbound traffic.',
					{
						remediation:
							'Enable ufw: "ufw default deny incoming && ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable"',
					},
				),
			);
		}
	} else {
		// CSF not installed and UFW is not active — suggest CSF
		findings.push(
			makeFinding(
				'info',
				'FIREWALL',
				'CSF (ConfigServer Firewall) is not installed',
				'CSF is the recommended firewall for CyberPanel servers. It provides advanced IP blocking and rate limiting.',
				{
					remediation:
						'Install CSF: wget https://download.configserver.com/csf.tgz && tar -xzf csf.tgz && cd csf && sh install.sh',
				},
			),
		);
	}

	// 2. Pending OS updates
	const { stdout: aptUpgradable } = await exec.execute(
		`apt list --upgradable 2>/dev/null | grep -c "\\[upgradable" || echo 0`,
		{ timeout: 30000 },
	);
	const updateCount = parseInt(aptUpgradable.trim(), 10);
	if (updateCount > 50) {
		findings.push(
			makeFinding(
				'high',
				'OS_UPDATES',
				`${updateCount} pending OS packages to update`,
				'A large number of unpatched packages increases the attack surface.',
				{
					remediation:
						'Run "apt update && apt upgrade -y" to apply all security updates.',
					metadata: { pending_updates: updateCount },
				},
			),
		);
	} else if (updateCount > 10) {
		findings.push(
			makeFinding(
				'medium',
				'OS_UPDATES',
				`${updateCount} pending OS packages to update`,
				'Security updates are available but not yet applied.',
				{
					remediation: 'Run "apt update && apt upgrade -y".',
					metadata: { pending_updates: updateCount },
				},
			),
		);
	} else if (updateCount > 0) {
		findings.push(
			makeFinding(
				'low',
				'OS_UPDATES',
				`${updateCount} pending OS update(s)`,
				'Minor updates are available.',
				{ metadata: { pending_updates: updateCount } },
			),
		);
	}

	// 3. Fail2ban status — essential for blocking SSH brute-force
	const { stdout: fail2banStatus } = await exec.execute(
		`systemctl is-active fail2ban 2>/dev/null || echo inactive`,
		{ timeout: 10000 },
	);
	if (!fail2banStatus.trim().startsWith('active')) {
		const { stdout: fail2banExists } = await exec.execute(
			`which fail2ban-client 2>/dev/null && echo found || echo missing`,
		);
		findings.push(
			makeFinding(
				'high',
				'SECURITY_TOOLS',
				fail2banExists.includes('missing')
					? 'fail2ban is not installed'
					: 'fail2ban is installed but not running',
				'fail2ban automatically bans IPs with repeated failed SSH logins. It is the primary defence against brute-force attacks.',
				{
					remediation: fail2banExists.includes('missing')
						? 'apt install fail2ban -y && systemctl enable fail2ban && systemctl start fail2ban'
						: 'systemctl enable fail2ban && systemctl start fail2ban',
				},
			),
		);
	}

	// 4. ClamAV antivirus daemon
	const { stdout: clamavStatus } = await exec.execute(
		`systemctl is-active clamav-daemon 2>/dev/null || echo inactive`,
		{ timeout: 10000 },
	);
	if (!clamavStatus.trim().startsWith('active')) {
		const { stdout: clamavExists } = await exec.execute(
			`which clamscan 2>/dev/null && echo found || echo missing`,
		);
		findings.push(
			makeFinding(
				'medium',
				'SECURITY_TOOLS',
				clamavExists.includes('missing')
					? 'ClamAV is not installed'
					: 'ClamAV daemon is not running',
				'ClamAV provides real-time file scanning to detect webshells and malware.',
				{
					remediation: clamavExists.includes('missing')
						? 'apt install clamav clamav-daemon -y && freshclam && systemctl enable clamav-daemon && systemctl start clamav-daemon'
						: 'systemctl enable clamav-daemon && systemctl start clamav-daemon && freshclam',
				},
			),
		);
	}

	// 5. World-writable files — anyone can modify these
	const { stdout: worldWritable } = await exec.execute(
		`find /home -type f -perm -002 -not -path "*/proc/*" -not -path "*/.git/*" 2>/dev/null | head -20 || true`,
		{ timeout: 60000 },
	);
	const wwFiles = worldWritable
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);
	if (wwFiles.length > 0) {
		findings.push(
			makeFinding(
				'high',
				'WORLD_WRITABLE',
				`${wwFiles.length} world-writable file(s) found`,
				'World-writable files can be modified by any process running on the server — a common malware propagation vector.',
				{
					remediation: `chmod o-w <file> for each entry. Run: find /home -type f -perm -002 -exec chmod o-w {} \\;`,
					metadata: { files: wwFiles },
				},
			),
		);
	}

	// 6. Suspicious cron entries — common persistence mechanism
	const { stdout: cronContent } = await exec.execute(
		`(cat /etc/crontab 2>/dev/null; ls /etc/cron.d/ 2>/dev/null | xargs -I{} cat /etc/cron.d/{} 2>/dev/null; crontab -l 2>/dev/null; for u in $(ls /home 2>/dev/null); do crontab -u "$u" -l 2>/dev/null; done) | grep -E "curl |wget |base64|/tmp/[a-zA-Z]|python[23]? -c|bash -[ic]" || true`,
		{ timeout: 30000 },
	);
	const suspiciousCrons = cronContent
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);
	if (suspiciousCrons.length > 0) {
		findings.push(
			makeFinding(
				'critical',
				'CRON_JOBS',
				`${suspiciousCrons.length} suspicious cron job(s) detected`,
				'Cron entries that download, execute from temp, or use base64/eval are a common attacker persistence mechanism.',
				{
					remediation:
						'Inspect each flagged cron entry. If unknown, remove it: crontab -e or edit /etc/cron.d/<file>',
					metadata: { entries: suspiciousCrons },
				},
			),
		);
	}

	// 7. Auditd — kernel-level audit trail
	const { stdout: auditdStatus } = await exec.execute(
		`systemctl is-active auditd 2>/dev/null || echo inactive`,
		{ timeout: 10000 },
	);
	if (!auditdStatus.trim().startsWith('active')) {
		findings.push(
			makeFinding(
				'info',
				'SECURITY_TOOLS',
				'auditd is not running',
				'The Linux audit daemon provides kernel-level logging of privileged actions, file access, and system calls.',
				{
					remediation:
						'apt install auditd audispd-plugins -y && systemctl enable auditd && systemctl start auditd',
				},
			),
		);
	}

	return findings;
}

// ─── MALWARE_SCAN ─────────────────────────────────────────────────────────────

export async function runMalwareScan(
	exec: Executor,
): Promise<SecurityFinding[]> {
	const findings: SecurityFinding[] = [];

	// 1. ClamAV on-demand scan
	const { stdout: clamavCheck } = await exec.execute(
		`which clamscan 2>/dev/null && echo found || echo missing`,
	);
	if (clamavCheck.includes('found')) {
		const { stdout: clamScan } = await exec.execute(
			`clamscan --infected --recursive --no-summary /home/*/public_html 2>/dev/null | head -100 || true`,
			{ timeout: 300000 },
		);
		const infected = clamScan.split('\n').filter(l => l.includes('FOUND'));
		if (infected.length > 0) {
			findings.push(
				makeFinding(
					'critical',
					'MALWARE',
					`ClamAV: ${infected.length} infected file(s) found`,
					`ClamAV detected malware in: ${infected.slice(0, 5).join('; ')}${infected.length > 5 ? ' …' : ''}`,
					{
						remediation:
							'Quarantine or delete the infected files immediately. ' +
							'Investigate how the malware was introduced (outdated plugin, weak credentials, etc.).',
						metadata: { infected_files: infected.slice(0, 20) },
					},
				),
			);
		}
	}

	// 2. Try maldet (Linux Malware Detect)
	const { stdout: maldetCheck } = await exec.execute(
		`which maldet 2>/dev/null && echo found || echo missing`,
	);
	if (maldetCheck.includes('found')) {
		const { stdout: maldetScan } = await exec.execute(
			`maldet --scan-all /home/*/public_html 2>/dev/null | tail -30 || true`,
			{ timeout: 300000 },
		);
		const hitLines = maldetScan
			.split('\n')
			.filter(l => l.toLowerCase().includes('hit') || l.includes('INFECTED'));
		if (hitLines.length > 0) {
			findings.push(
				makeFinding(
					'critical',
					'MALWARE',
					`Maldet: ${hitLines.length} hit(s)`,
					hitLines.slice(0, 5).join('; '),
					{
						remediation:
							'Run "maldet --clean <reportid>" then audit the affected sites.',
						metadata: { hits: hitLines.slice(0, 20) },
					},
				),
			);
		}
	}

	// 3. Pattern-based scan (always runs — no tool dependency)
	const suspiciousPatterns = [
		{ name: 'base64_decode eval', pattern: `eval(base64_decode` },
		{ name: 'preg_replace eval (/e)', pattern: `preg_replace.*\\/e` },
		{ name: 'assert(base64_decode)', pattern: `assert.base64_decode` },
		{ name: 'POST execution (webshell)', pattern: `\\$_POST.*eval` },
		{
			name: 'c99/r57 webshell signature',
			pattern: `FilesMan\\|c99shell\\|r57shell`,
		},
		{
			name: 'gzinflate/eval chain',
			pattern: `gzinflate.*eval\\|eval.*gzinflate`,
		},
	];

	for (const { name, pattern } of suspiciousPatterns) {
		const { stdout: matches } = await exec.execute(
			`grep -rl "${pattern}" /home/*/public_html --include="*.php" 2>/dev/null | head -20 || true`,
			{ timeout: 60000 },
		);
		const files = matches
			.split('\n')
			.map(l => l.trim())
			.filter(Boolean);
		if (files.length > 0) {
			findings.push(
				makeFinding(
					'critical',
					'MALWARE',
					`Suspicious PHP pattern detected: ${name}`,
					`Found ${files.length} file(s) matching the "${name}" pattern.`,
					{
						remediation:
							'Inspect these files manually. If confirmed malicious, delete them, ' +
							'identify the entry point (outdated plugin/theme, weak FTP password), and rotate all credentials.',
						metadata: { matched_files: files },
					},
				),
			);
		}
	}

	// 4. PHP files in uploads (critical — webshell indicator)
	const { stdout: phpInUploads } = await exec.execute(
		`find /home/*/public_html -path "*/uploads/*.php" -type f 2>/dev/null | head -20 || true`,
		{ timeout: 30000 },
	);
	const phpUploadFiles = phpInUploads
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);
	if (phpUploadFiles.length > 0) {
		findings.push(
			makeFinding(
				'critical',
				'SUSPICIOUS_FILES',
				`PHP file(s) found in WordPress uploads directory`,
				`${phpUploadFiles.length} .php file(s) found in /uploads/ directories — this is a strong indicator of a webshell backdoor.`,
				{
					remediation:
						'Delete these files immediately. Add a rule to deny PHP execution in wp-content/uploads ' +
						'via .htaccess: "deny from all" inside uploads/ and "RemoveHandler .php" / "php_flag engine off".',
					metadata: { files: phpUploadFiles },
				},
			),
		);
	}

	// 5. Recently modified PHP files (last 7 days)
	const { stdout: recentFiles } = await exec.execute(
		`find /home/*/public_html -name "*.php" -newer /home -mtime -7 -type f 2>/dev/null | head -50 || true`,
		{ timeout: 30000 },
	);
	const recentPhp = recentFiles
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);
	if (recentPhp.length > 10) {
		findings.push(
			makeFinding(
				'medium',
				'SUSPICIOUS_FILES',
				`${recentPhp.length} PHP files modified in the last 7 days`,
				'A large number of recently modified PHP files may indicate a compromise or mass injection.',
				{
					remediation:
						'Diff these files against a clean backup to detect injected code.',
					metadata: { files: recentPhp.slice(0, 30) },
				},
			),
		);
	} else if (recentPhp.length > 0) {
		findings.push(
			makeFinding(
				'info',
				'SUSPICIOUS_FILES',
				`${recentPhp.length} PHP file(s) modified in the last 7 days`,
				'Review recently modified files to confirm changes are expected.',
				{ metadata: { files: recentPhp } },
			),
		);
	}

	// 6. .htaccess injection — attackers inject redirects and eval chains
	const { stdout: htaccessScan } = await exec.execute(
		`grep -rl --include=".htaccess" -E "eval|base64_decode|RewriteRule.*https?://" /home 2>/dev/null | head -20 || true`,
		{ timeout: 60000 },
	);
	const htaccessFiles = htaccessScan
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);
	if (htaccessFiles.length > 0) {
		findings.push(
			makeFinding(
				'critical',
				'HTACCESS',
				`Malicious .htaccess file(s) detected: ${htaccessFiles.length} file(s)`,
				'.htaccess files containing eval/base64 or external rewrites indicate malware injection.',
				{
					remediation:
						'Inspect each .htaccess file manually. Remove injected lines and harden the site.',
					metadata: { files: htaccessFiles },
				},
			),
		);
	}

	// 7. Reverse shell patterns in PHP files
	const reverseShellPatterns = [
		{ name: 'bash reverse shell (/dev/tcp)', pattern: '/dev/tcp/' },
		{
			name: 'nc bind shell (nc -e)',
			pattern: 'nc -e /bin/bash\\|nc -e /bin/sh\\|nc -e bash',
		},
		{
			name: 'Python pty.spawn shell',
			pattern: 'import pty.*spawn\\|pty\\.spawn',
		},
		{ name: 'socat exec shell', pattern: 'socat.*exec:.*bash\\|socat.*EXEC:' },
	];
	for (const { name, pattern } of reverseShellPatterns) {
		const { stdout: rsMatches } = await exec.execute(
			`grep -rl "${pattern}" /home/*/public_html --include="*.php" 2>/dev/null | head -10 || true`,
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
					`Found ${rsFiles.length} PHP file(s) matching "${name}" — strong indicator of an active backdoor.`,
					{
						remediation:
							'Delete or quarantine these files immediately. Block outbound connections if possible. ' +
							'Rotate all credentials on this server.',
						metadata: { files: rsFiles },
					},
				),
			);
		}
	}

	// 8. PHP files in /tmp or /var/tmp — malware staging area
	const { stdout: phpInTmp } = await exec.execute(
		`find /tmp /var/tmp -name "*.php" -type f 2>/dev/null | head -20 || true`,
		{ timeout: 15000 },
	);
	const tmpPhpFiles = phpInTmp
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);
	if (tmpPhpFiles.length > 0) {
		findings.push(
			makeFinding(
				'critical',
				'SUSPICIOUS_FILES',
				`${tmpPhpFiles.length} PHP file(s) found in /tmp or /var/tmp`,
				'PHP scripts in temp directories are commonly used as dropper stages for webshells.',
				{
					remediation:
						'Delete these files immediately. Investigate how they were placed there.',
					metadata: { files: tmpPhpFiles },
				},
			),
		);
	}

	// 9. iframe injection — malware injects hidden iframes to redirect visitors
	const { stdout: iframeMatches } = await exec.execute(
		`grep -rl --include="*.php" -E "<iframe[^>]+src=[\"']https?://" /home/*/public_html 2>/dev/null | head -10 || true`,
		{ timeout: 30000 },
	);
	const iframeFiles = iframeMatches
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean);
	if (iframeFiles.length > 0) {
		findings.push(
			makeFinding(
				'high',
				'MALWARE',
				`iframe injection pattern found in ${iframeFiles.length} file(s)`,
				'PHP files containing hidden iframes with external URLs are a common drive-by download injection.',
				{
					remediation:
						'Inspect each file. Remove injected iframe tags and identify the source of the injection.',
					metadata: { files: iframeFiles },
				},
			),
		);
	}

	return findings;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolveAuthLog(exec: Executor): Promise<string | null> {
	// Try Ubuntu/Debian paths first, then CentOS/RHEL
	for (const path of [
		'/var/log/auth.log',
		'/var/log/secure',
		'/var/log/auth.log.1',
	]) {
		const { stdout } = await exec.execute(
			`test -f ${path} && echo exists || echo missing`,
		);
		if (stdout.trim() === 'exists') return path;
	}
	return null;
}
