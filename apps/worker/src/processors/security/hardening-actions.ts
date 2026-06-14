/**
 * SSH-based idempotent hardening actions for servers and WordPress environments.
 *
 * Each action:
 * - checks whether the fix is already applied before making changes
 * - returns `skipped` when the desired state is already present
 * - returns `applied` when the change was made successfully
 * - returns `failed` when something unexpected occurred
 */

import type {
  EnvironmentHardeningActionType,
  HardeningActionResult,
  ServerHardeningActionType,
} from "@bedrock-forge/shared";

/** Duck-typed executor interface — matches RemoteExecutorService.execute() */
type Executor = {
  execute(
    cmd: string,
    opts?: { timeout?: number },
  ): Promise<{ stdout: string; stderr: string; code: number }>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function run(
  exec: Executor,
  cmd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return exec.execute(cmd);
}

/** Validates that a string is a well-formed IPv4 address (defense-in-depth). */
function isValidIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

function ok(action: string, detail: string): HardeningActionResult {
  return { action, status: "applied", detail };
}

function skip(action: string, detail: string): HardeningActionResult {
  return { action, status: "skipped", detail };
}

function fail(action: string, detail: string): HardeningActionResult {
  return { action, status: "failed", detail };
}

// ─── Server hardening actions ─────────────────────────────────────────────────

async function fixWorldWritable(
  exec: Executor,
): Promise<HardeningActionResult> {
  const action = "FIX_WORLD_WRITABLE";
  // Find world-writable files under /home (excluding symlinks and special fs)
  const find = await run(
    exec,
    "find /home -xdev -type f -perm -002 2>/dev/null | head -500",
  );
  const files = find.stdout.trim();
  if (!files) return skip(action, "No world-writable files found in /home");

  const fix = await run(
    exec,
    "find /home -xdev -type f -perm -002 -exec chmod o-w {} \\;",
  );
  if (fix.code !== 0) return fail(action, fix.stderr || "chmod failed");

  const count = files.split("\n").length;
  return ok(action, `Removed world-writable bit from ${count} file(s)`);
}

async function disableX11Forwarding(
  exec: Executor,
): Promise<HardeningActionResult> {
  const action = "DISABLE_X11_FORWARDING";
  const check = await run(
    exec,
    'grep -qE "^X11Forwarding\\s+no" /etc/ssh/sshd_config',
  );
  if (check.code === 0) return skip(action, "X11Forwarding already disabled");

  // Replace any existing X11Forwarding line, or append if absent
  const sed = await run(
    exec,
    'grep -qE "^X11Forwarding" /etc/ssh/sshd_config ' +
      '&& sed -i "s/^X11Forwarding.*/X11Forwarding no/" /etc/ssh/sshd_config ' +
      '|| echo "X11Forwarding no" >> /etc/ssh/sshd_config',
  );
  if (sed.code !== 0)
    return fail(action, sed.stderr || "sshd_config edit failed");

  const reload = await run(
    exec,
    "systemctl reload sshd 2>&1 || systemctl reload ssh 2>&1",
  );
  if (reload.code !== 0)
    return fail(
      action,
      `Config written but sshd reload failed: ${reload.stdout}`,
    );

  return ok(action, "X11Forwarding set to no, sshd reloaded");
}

async function setMaxAuthTries(exec: Executor): Promise<HardeningActionResult> {
  const action = "SET_MAX_AUTH_TRIES";
  // Consider already hardened if MaxAuthTries <= 3
  const check = await run(
    exec,
    'grep -qE "^MaxAuthTries\\s+[1-3]$" /etc/ssh/sshd_config',
  );
  if (check.code === 0)
    return skip(action, "MaxAuthTries already set to 3 or lower");

  const sed = await run(
    exec,
    'grep -qE "^MaxAuthTries" /etc/ssh/sshd_config ' +
      '&& sed -i "s/^MaxAuthTries.*/MaxAuthTries 3/" /etc/ssh/sshd_config ' +
      '|| echo "MaxAuthTries 3" >> /etc/ssh/sshd_config',
  );
  if (sed.code !== 0)
    return fail(action, sed.stderr || "sshd_config edit failed");

  const reload = await run(
    exec,
    "systemctl reload sshd 2>&1 || systemctl reload ssh 2>&1",
  );
  if (reload.code !== 0)
    return fail(
      action,
      `Config written but sshd reload failed: ${reload.stdout}`,
    );

  return ok(action, "MaxAuthTries set to 3, sshd reloaded");
}

async function fixSshDirPerms(exec: Executor): Promise<HardeningActionResult> {
  const action = "FIX_SSH_DIR_PERMS";
  // Fix /root/.ssh and all /home/*/.ssh directories
  const fix = await run(
    exec,
    'for d in /root/.ssh /home/*/.ssh; do [ -d "$d" ] && chmod 700 "$d"; done',
  );
  if (fix.code !== 0) return fail(action, fix.stderr || "chmod failed");
  return ok(action, ".ssh directories set to 700");
}

async function disablePasswordAuth(
  exec: Executor,
): Promise<HardeningActionResult> {
  const action = "DISABLE_PASSWORD_AUTH";
  const check = await run(
    exec,
    'grep -qE "^PasswordAuthentication\\s+no" /etc/ssh/sshd_config',
  );
  if (check.code === 0)
    return skip(action, "PasswordAuthentication already disabled");

  const sed = await run(
    exec,
    'grep -qE "^PasswordAuthentication" /etc/ssh/sshd_config ' +
      '&& sed -i "s/^PasswordAuthentication.*/PasswordAuthentication no/" /etc/ssh/sshd_config ' +
      '|| echo "PasswordAuthentication no" >> /etc/ssh/sshd_config',
  );
  if (sed.code !== 0)
    return fail(action, sed.stderr || "sshd_config edit failed");

  const reload = await run(
    exec,
    "systemctl reload sshd 2>&1 || systemctl reload ssh 2>&1",
  );
  if (reload.code !== 0)
    return fail(
      action,
      `Config written but sshd reload failed: ${reload.stdout}`,
    );

  return ok(action, "PasswordAuthentication set to no, sshd reloaded");
}

async function installFail2ban(exec: Executor): Promise<HardeningActionResult> {
  const action = "INSTALL_FAIL2BAN";
  const statusCheck = await run(
    exec,
    "systemctl is-active fail2ban 2>/dev/null || echo inactive",
  );
  if (statusCheck.stdout.trim().startsWith("active"))
    return skip(action, "fail2ban is already running");

  const exists = await run(
    exec,
    "which fail2ban-client 2>/dev/null && echo found || echo missing",
  );
  if (exists.stdout.includes("missing")) {
    const install = await run(exec, "apt-get install -y fail2ban 2>&1");
    if (install.code !== 0)
      return fail(action, install.stderr || "apt install fail2ban failed");
  }

  const enable = await run(
    exec,
    "systemctl enable fail2ban 2>&1 && systemctl start fail2ban 2>&1",
  );
  if (enable.code !== 0)
    return fail(action, enable.stderr || "Failed to enable/start fail2ban");

  return ok(action, "fail2ban installed, enabled, and started");
}

async function installAuditd(exec: Executor): Promise<HardeningActionResult> {
  const action = "INSTALL_AUDITD";
  const statusCheck = await run(
    exec,
    "systemctl is-active auditd 2>/dev/null || echo inactive",
  );
  if (statusCheck.stdout.trim().startsWith("active"))
    return skip(action, "auditd is already running");

  const exists = await run(
    exec,
    "which auditd 2>/dev/null && echo found || echo missing",
  );
  if (exists.stdout.includes("missing")) {
    const install = await run(
      exec,
      "apt-get install -y auditd audispd-plugins 2>&1",
    );
    if (install.code !== 0)
      return fail(action, install.stderr || "apt install auditd failed");
  }

  const enable = await run(
    exec,
    "systemctl enable auditd 2>&1 && systemctl start auditd 2>&1",
  );
  if (enable.code !== 0)
    return fail(action, enable.stderr || "Failed to enable/start auditd");

  return ok(action, "auditd installed, enabled, and started");
}

async function blockBruteForceIps(
  exec: Executor,
): Promise<HardeningActionResult> {
  const action = "BLOCK_BRUTE_FORCE_IPS";

  // Find auth log
  let authLog = "";
  for (const p of ["/var/log/auth.log", "/var/log/secure"]) {
    const check = await run(
      exec,
      `test -f ${p} && echo exists || echo missing`,
    );
    if (check.stdout.trim() === "exists") {
      authLog = p;
      break;
    }
  }
  if (!authLog) return skip(action, "No auth log found");

  // Collect IPs with ≥50 failed attempts
  const { stdout: raw } = await exec.execute(
    `grep -i "Failed password" ${authLog} 2>/dev/null | grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+" | sort | uniq -c | sort -rn | awk '$1 >= 50 {print $2}' | head -50 || true`,
    { timeout: 20000 },
  );
  const ips = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (ips.length === 0)
    return skip(action, "No IPs with ≥50 failed login attempts found");

  // Validate every IP before it reaches a shell command
  const validIps = ips.filter((ip) => {
    if (isValidIPv4(ip)) return true;
    // Should never happen given the server-side grep regex, but guard anyway
    return false;
  });
  if (validIps.length === 0)
    return skip(action, "No valid IPv4 addresses extracted from auth log");

  let blocked = 0;
  const failed: string[] = [];
  for (const ip of validIps) {
    const already = await run(
      exec,
      `ufw status 2>/dev/null | grep -qF "${ip}" && echo yes || echo no`,
    );
    if (already.stdout.trim() === "yes") continue;
    const deny = await run(exec, `ufw deny from ${ip} to any 2>&1 || true`);
    if (deny.code === 0 || deny.stdout.includes("Rule added")) {
      blocked++;
    } else {
      failed.push(ip);
    }
  }

  if (failed.length > 0)
    return fail(
      action,
      `Blocked ${blocked} IP(s); failed on: ${failed.join(", ")}`,
    );
  return ok(
    action,
    blocked === 0
      ? `All ${validIps.length} IPs were already blocked`
      : `Blocked ${blocked} brute-force IP(s) via ufw: ${validIps.slice(0, 5).join(", ")}${validIps.length > 5 ? "…" : ""}`,
  );
}

async function deletePhpUploadFilesServer(
  exec: Executor,
): Promise<HardeningActionResult> {
  const action = "DELETE_PHP_UPLOAD_FILES";
  const { stdout: found } = await exec.execute(
    `find /home/*/public_html -path "*/uploads/*.php" -type f 2>/dev/null | head -100 || true`,
    { timeout: 30000 },
  );
  const files = found
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (files.length === 0)
    return skip(action, "No PHP files found in uploads directories");

  const del = await exec.execute(
    `find /home/*/public_html -path "*/uploads/*.php" -type f -delete 2>&1 || true`,
    { timeout: 30000 },
  );
  if (del.code !== 0 && del.stderr)
    return fail(action, del.stderr || "Delete command failed");

  return ok(
    action,
    `Deleted ${files.length} PHP file(s) from uploads directories`,
  );
}

async function cleanHtaccessRedirectsServer(
  exec: Executor,
): Promise<HardeningActionResult> {
  const action = "CLEAN_HTACCESS_REDIRECTS";
  const { stdout: found } = await exec.execute(
    `grep -rl --include=".htaccess" -E "RewriteRule[[:space:]]+\\S+[[:space:]]+https?://[^%]" /home 2>/dev/null | head -20 || true`,
    { timeout: 30000 },
  );
  const files = found
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (files.length === 0)
    return skip(action, "No suspicious .htaccess redirects found");

  let cleaned = 0;
  const failedFiles: string[] = [];
  for (const file of files) {
    const sed = await run(
      exec,
      `sed -i -E '/RewriteRule[[:space:]]+[^[:space:]]+[[:space:]]+https?:\\/\\/[^%]/d' "${file}" 2>&1`,
    );
    if (sed.code === 0) cleaned++;
    else failedFiles.push(file);
  }

  if (failedFiles.length > 0)
    return fail(
      action,
      `Cleaned ${cleaned} file(s); failed on: ${failedFiles.join(", ")}`,
    );
  return ok(
    action,
    `Removed suspicious redirect rules from ${cleaned} .htaccess file(s)`,
  );
}

// ─── Environment (WordPress) hardening actions ────────────────────────────────

/**
 * Resolve the WordPress web root.
 * Bedrock layout:  <rootPath>/web/wp-config.php  → webRoot = <rootPath>/web
 * Standard layout: <rootPath>/wp-config.php       → webRoot = <rootPath>
 */
async function resolveWebRoot(
  exec: Executor,
  rootPath: string,
): Promise<string> {
  const bedrockCheck = await run(
    exec,
    `[ -f "${rootPath}/web/wp-config.php" ] && echo "bedrock" || echo "standard"`,
  );
  return bedrockCheck.stdout.trim() === "bedrock"
    ? `${rootPath}/web`
    : rootPath;
}

async function blockPhpUploads(
  exec: Executor,
  webRoot: string,
): Promise<HardeningActionResult> {
  const action = "BLOCK_PHP_UPLOADS";
  const htaccess = `${webRoot}/wp-content/uploads/.htaccess`;
  const block =
    '<FilesMatch "\\.(php|php5|phtml)$">\n  Deny from all\n</FilesMatch>';

  // Ensure the uploads directory exists
  const mkDir = await run(exec, `mkdir -p "${webRoot}/wp-content/uploads"`);
  if (mkDir.code !== 0)
    return fail(action, mkDir.stderr || "Cannot create uploads dir");

  const check = await run(
    exec,
    `grep -q "FilesMatch" "${htaccess}" 2>/dev/null`,
  );
  if (check.code === 0) return skip(action, "PHP block rule already present");

  const write = await run(
    exec,
    `printf '%s\\n' '${block.replace(/'/g, "'\\''")}' >> "${htaccess}"`,
  );
  if (write.code !== 0)
    return fail(action, write.stderr || "Failed to write .htaccess");

  return ok(action, `PHP execution blocked in ${htaccess}`);
}

async function blockXmlrpc(
  exec: Executor,
  webRoot: string,
): Promise<HardeningActionResult> {
  const action = "BLOCK_XMLRPC";
  const htaccess = `${webRoot}/.htaccess`;

  const check = await run(
    exec,
    `grep -q "xmlrpc.php" "${htaccess}" 2>/dev/null`,
  );
  if (check.code === 0) return skip(action, "xmlrpc.php block already present");

  const write = await run(
    exec,
    `printf '\\n# Block xmlrpc.php\\n<Files xmlrpc.php>\\n  Order Deny,Allow\\n  Deny from all\\n</Files>\\n' >> "${htaccess}"`,
  );
  if (write.code !== 0)
    return fail(action, write.stderr || "Failed to write .htaccess");

  return ok(action, `xmlrpc.php blocked in ${htaccess}`);
}

async function blockVersionDisclosure(
  exec: Executor,
  webRoot: string,
): Promise<HardeningActionResult> {
  const action = "BLOCK_VERSION_DISCLOSURE";
  const htaccess = `${webRoot}/.htaccess`;
  const check = await run(
    exec,
    `grep -q "readme.html" "${htaccess}" 2>/dev/null`,
  );
  if (check.code === 0)
    return skip(action, "Version disclosure block already present");

  const write = await run(
    exec,
    `echo -e "\\n# Block version disclosure\\n<FilesMatch \\"(readme\\\\.html|license\\\\.txt|readme\\\\.txt)\\$\\">\\n  Order Deny,Allow\\n  Deny from all\\n</FilesMatch>" >> "${htaccess}"`,
  );
  if (write.code !== 0)
    return fail(action, write.stderr || "Failed to write .htaccess");

  return ok(action, `Version disclosure files blocked in ${htaccess}`);
}

async function addSecurityHeaders(
  exec: Executor,
  webRoot: string,
): Promise<HardeningActionResult> {
  const action = "ADD_SECURITY_HEADERS";
  const htaccess = `${webRoot}/.htaccess`;
  const check = await run(
    exec,
    `grep -q "X-Frame-Options" "${htaccess}" 2>/dev/null`,
  );
  if (check.code === 0) return skip(action, "Security headers already present");

  const headersBlock = [
    "",
    "# Security headers",
    "<IfModule mod_headers.c>",
    '  Header always set X-Frame-Options "SAMEORIGIN"',
    '  Header always set X-Content-Type-Options "nosniff"',
    '  Header always set X-XSS-Protection "1; mode=block"',
    '  Header always set Referrer-Policy "strict-origin-when-cross-origin"',
    "</IfModule>",
  ].join("\\n");

  const write = await run(exec, `echo -e "${headersBlock}" >> "${htaccess}"`);
  if (write.code !== 0)
    return fail(action, write.stderr || "Failed to write .htaccess");

  return ok(action, `Security headers added to ${htaccess}`);
}

async function disableDirectoryListing(
  exec: Executor,
  webRoot: string,
): Promise<HardeningActionResult> {
  const action = "DISABLE_DIRECTORY_LISTING";
  const htaccess = `${webRoot}/.htaccess`;
  const check = await run(
    exec,
    `grep -q "Options -Indexes" "${htaccess}" 2>/dev/null`,
  );
  if (check.code === 0)
    return skip(action, "Directory listing already disabled");

  const write = await run(
    exec,
    `echo -e "\\n# Disable directory listing\\nOptions -Indexes" >> "${htaccess}"`,
  );
  if (write.code !== 0)
    return fail(action, write.stderr || "Failed to write .htaccess");

  return ok(action, `Directory listing disabled in ${htaccess}`);
}

async function deletePhpUploadFilesEnv(
  exec: Executor,
  webRoot: string,
): Promise<HardeningActionResult> {
  const action = "DELETE_PHP_UPLOAD_FILES";
  const uploadsDir = `${webRoot}/wp-content/uploads`;
  const { stdout: found } = await exec.execute(
    `find "${uploadsDir}" -name "*.php" -type f 2>/dev/null | head -100 || true`,
    { timeout: 30000 },
  );
  const files = found
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (files.length === 0)
    return skip(action, `No PHP files found in ${uploadsDir}`);

  const del = await exec.execute(
    `find "${uploadsDir}" -name "*.php" -type f -delete 2>&1 || true`,
    { timeout: 30000 },
  );
  if (del.code !== 0 && del.stderr)
    return fail(action, del.stderr || "Delete command failed");

  return ok(action, `Deleted ${files.length} PHP file(s) from ${uploadsDir}`);
}

async function cleanHtaccessRedirectsEnv(
  exec: Executor,
  webRoot: string,
): Promise<HardeningActionResult> {
  const action = "CLEAN_HTACCESS_REDIRECTS";
  const htaccess = `${webRoot}/.htaccess`;
  const check = await run(
    exec,
    `grep -qE "RewriteRule[[:space:]]+\\S+[[:space:]]+https?://[^%]" "${htaccess}" 2>/dev/null`,
  );
  if (check.code !== 0)
    return skip(action, "No suspicious .htaccess redirects found");

  const sed = await run(
    exec,
    `sed -i -E '/RewriteRule[[:space:]]+[^[:space:]]+[[:space:]]+https?:\\/\\/[^%]/d' "${htaccess}" 2>&1`,
  );
  if (sed.code !== 0)
    return fail(action, sed.stderr || "Failed to clean .htaccess");

  return ok(action, `Removed suspicious redirect rules from ${htaccess}`);
}

async function blockDebugLog(
  exec: Executor,
  webRoot: string,
): Promise<HardeningActionResult> {
  const action = "BLOCK_DEBUG_LOG";
  // Target wp-content/.htaccess — access directives must be in the same
  // directory as the protected file for reliable enforcement on OLS/CyberPanel.
  const wpContentDir = `${webRoot}/wp-content`;
  const htaccess = `${wpContentDir}/.htaccess`;

  const check = await run(
    exec,
    `grep -q "_bf_debuglog_block_" "${htaccess}" 2>/dev/null`,
  );
  if (check.code === 0) return skip(action, "Debug log block already present");

  // Delete any existing debug.log immediately — belt-and-suspenders.
  await run(
    exec,
    `rm -f "${wpContentDir}/debug.log" "${wpContentDir}/debug.log.1" 2>/dev/null || true`,
  );

  const block = [
    "",
    "# _bf_debuglog_block_ Block access to WordPress log files",
    '<FilesMatch "\\.(log)$">',
    "  <IfModule mod_authz_core.c>",
    "    Require all denied",
    "  </IfModule>",
    "  <IfModule !mod_authz_core.c>",
    "    Order Deny,Allow",
    "    Deny from all",
    "  </IfModule>",
    "</FilesMatch>",
  ].join("\n");

  const write = await run(
    exec,
    `printf '%s\\n' '${block.replace(/'/g, "'\\''")}' >> "${htaccess}"`,
  );
  if (write.code !== 0)
    return fail(action, write.stderr || "Failed to write .htaccess");
  return ok(
    action,
    `Log file access blocked in ${htaccess} and existing debug.log removed`,
  );
}

async function blockSensitiveFiles(
  exec: Executor,
  webRoot: string,
): Promise<HardeningActionResult> {
  const action = "BLOCK_SENSITIVE_FILES";
  const htaccess = `${webRoot}/.htaccess`;
  const wpContentDir = `${webRoot}/wp-content`;
  const appHtaccess = `${wpContentDir}/.htaccess`;
  const rootCheck = await run(
    exec,
    `grep -q "_bf_sensitive_block_" "${htaccess}" 2>/dev/null`,
  );
  const appCheck = await run(
    exec,
    `grep -q "_bf_app_path_guard_" "${appHtaccess}" 2>/dev/null`,
  );
  if (rootCheck.code === 0 && appCheck.code === 0)
    return skip(action, "Sensitive file and Bedrock app path blocks present");

  const mkDir = await run(exec, `mkdir -p "${wpContentDir}"`);
  if (mkDir.code !== 0)
    return fail(action, mkDir.stderr || "Cannot create wp-content dir");

  const denyBlock = [
    "  <IfModule mod_authz_core.c>",
    "    Require all denied",
    "  </IfModule>",
    "  <IfModule !mod_authz_core.c>",
    "    Order Deny,Allow",
    "    Deny from all",
    "  </IfModule>",
  ].join("\n");
  const block = [
    "",
    "# _bf_sensitive_block_ Deny access to backup, config, and package files",
    '<FilesMatch "\\.(env|bak|sql|gz|tar|zip|log)$">',
    denyBlock,
    "</FilesMatch>",
    '<FilesMatch "^(composer\\.(json|lock)|package\\.json|yarn\\.lock|\\.htpasswd)$">',
    denyBlock,
    "</FilesMatch>",
  ].join("\n");

  if (rootCheck.code !== 0) {
    const writeRoot = await run(
      exec,
      `printf '%s\\n' '${block.replace(/'/g, "'\\''")}' >> "${htaccess}"`,
    );
    if (writeRoot.code !== 0)
      return fail(action, writeRoot.stderr || "Failed to write .htaccess");
  }

  if (appCheck.code !== 0) {
    const appGuard = [
      "",
      "# _bf_app_path_guard_ Deny unsafe direct file access in wp-content/app",
      "Options -Indexes",
      '<FilesMatch "^\\.">',
      denyBlock,
      "</FilesMatch>",
      '<FilesMatch "\\.(php|php3|php4|php5|phtml|phar|pl|py|jsp|asp|aspx|cgi|sh|log|ini|conf|bak|sql|env|gz|tar|zip)$">',
      denyBlock,
      "</FilesMatch>",
      '<FilesMatch "^(composer\\.(json|lock)|package\\.json|yarn\\.lock|pnpm-lock\\.yaml|\\.htpasswd)$">',
      denyBlock,
      "</FilesMatch>",
      "<IfModule mod_rewrite.c>",
      "  RewriteEngine On",
      "  RewriteCond %{REQUEST_FILENAME} -f",
      "  RewriteCond %{REQUEST_URI} !\\.(css|js|mjs|map|json|jpg|jpeg|png|gif|webp|svg|ico|woff|woff2|ttf|eot|otf|pdf|txt|xml|mp4|webm|mp3|wav|avif)$ [NC]",
      "  RewriteRule ^ - [F,L]",
      "</IfModule>",
    ].join("\n");
    const writeApp = await run(
      exec,
      `printf '%s\\n' '${appGuard.replace(/'/g, "'\\''")}' >> "${appHtaccess}"`,
    );
    if (writeApp.code !== 0)
      return fail(
        action,
        writeApp.stderr || "Failed to write wp-content .htaccess",
      );
  }

  return ok(
    action,
    `Sensitive file access blocked in ${htaccess}; Bedrock app path guard enforced in ${appHtaccess}`,
  );
}

async function disableFileEditor(
  exec: Executor,
  webRoot: string,
  rootPath: string,
): Promise<HardeningActionResult> {
  const action = "DISABLE_FILE_EDITOR";
  // Bedrock stores main WP config in config/application.php; standard WP uses wp-config.php
  const bedrockConf = `${rootPath}/config/application.php`;
  const stdConf = `${webRoot}/wp-config.php`;
  const hasBedrockConf =
    (
      await run(exec, `[ -f "${bedrockConf}" ] && echo yes || echo no`)
    ).stdout.trim() === "yes";
  const configFile = hasBedrockConf ? bedrockConf : stdConf;

  const check = await run(
    exec,
    `grep -q "WP_DISALLOW_FILE_EDIT" "${configFile}" 2>/dev/null`,
  );
  if (check.code === 0) return skip(action, "File editor already disabled");

  const define = "define('WP_DISALLOW_FILE_EDIT', true);";
  const escaped = define.replace(/'/g, "'\\''");
  // If the file ends with ?>, insert before it; otherwise append
  const write = await run(
    exec,
    `last=$(tail -1 "${configFile}"); ` +
      `if [ "$last" = "?>" ]; then ` +
      `tmp=$(mktemp); head -n -1 "${configFile}" > "$tmp" && ` +
      `printf '%s\\n' '${escaped}' >> "$tmp" && ` +
      `echo '?>' >> "$tmp" && mv "$tmp" "${configFile}"; ` +
      `else printf '\\n%s\\n' '${escaped}' >> "${configFile}"; fi`,
  );
  if (write.code !== 0)
    return fail(action, write.stderr || `Failed to write to ${configFile}`);
  return ok(action, `WP_DISALLOW_FILE_EDIT added to ${configFile}`);
}

async function blockUserEnumeration(
  exec: Executor,
  webRoot: string,
): Promise<HardeningActionResult> {
  const action = "BLOCK_USER_ENUMERATION";
  const htaccess = `${webRoot}/.htaccess`;
  const check = await run(exec, `grep -q "author=" "${htaccess}" 2>/dev/null`);
  if (check.code === 0)
    return skip(action, "User enumeration block already present");
  const block = [
    "",
    "# Block WordPress user enumeration via ?author= queries",
    "<IfModule mod_rewrite.c>",
    "  RewriteCond %{QUERY_STRING} ^author=\\d",
    "  RewriteRule ^ /? [L,R=301]",
    "</IfModule>",
  ].join("\n");
  const write = await run(
    exec,
    `printf '%s\\n' '${block.replace(/'/g, "'\\''")}' >> "${htaccess}"`,
  );
  if (write.code !== 0)
    return fail(action, write.stderr || "Failed to write .htaccess");
  return ok(action, `User enumeration blocked via ${htaccess}`);
}

async function forceReinstallCore(
  exec: Executor,
  webRoot: string,
): Promise<HardeningActionResult> {
  const action = "FORCE_REINSTALL_CORE";
  const cmd = `wp core download --version=$(wp core version --path="${webRoot}" --skip-plugins --allow-root) --force --path="${webRoot}" --skip-plugins --allow-root`;
  const runCmd = await run(exec, cmd);
  if (runCmd.code !== 0)
    return fail(action, runCmd.stderr || "wp core download failed");
  return ok(action, "WordPress core files reinstalled successfully");
}

async function updateAllPlugins(
  exec: Executor,
  webRoot: string,
): Promise<HardeningActionResult> {
  const action = "UPDATE_ALL_PLUGINS";
  const cmd = `wp plugin update --all --path="${webRoot}" --skip-plugins --allow-root`;
  const runCmd = await run(exec, cmd);
  if (runCmd.code !== 0)
    return fail(action, runCmd.stderr || "wp plugin update failed");
  return ok(action, "All plugins updated to their latest versions");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function applyServerHardeningActions(
  exec: Executor,
  actions: ServerHardeningActionType[],
): Promise<HardeningActionResult[]> {
  const results: HardeningActionResult[] = [];

  for (const action of actions) {
    try {
      switch (action) {
        case "FIX_WORLD_WRITABLE":
          results.push(await fixWorldWritable(exec));
          break;
        case "DISABLE_X11_FORWARDING":
          results.push(await disableX11Forwarding(exec));
          break;
        case "SET_MAX_AUTH_TRIES":
          results.push(await setMaxAuthTries(exec));
          break;
        case "FIX_SSH_DIR_PERMS":
          results.push(await fixSshDirPerms(exec));
          break;
        case "DISABLE_PASSWORD_AUTH":
          results.push(await disablePasswordAuth(exec));
          break;
        case "INSTALL_FAIL2BAN":
          results.push(await installFail2ban(exec));
          break;
        case "INSTALL_AUDITD":
          results.push(await installAuditd(exec));
          break;
        case "BLOCK_BRUTE_FORCE_IPS":
          results.push(await blockBruteForceIps(exec));
          break;
        case "DELETE_PHP_UPLOAD_FILES":
          results.push(await deletePhpUploadFilesServer(exec));
          break;
        case "CLEAN_HTACCESS_REDIRECTS":
          results.push(await cleanHtaccessRedirectsServer(exec));
          break;
        default: {
          const _exhaustive: never = action;
          results.push(fail(_exhaustive as string, "Unknown action"));
        }
      }
    } catch (err) {
      results.push(
        fail(action, err instanceof Error ? err.message : String(err)),
      );
    }
  }

  return results;
}

export async function applyEnvironmentHardeningActions(
  exec: Executor,
  rootPath: string,
  actions: EnvironmentHardeningActionType[],
): Promise<HardeningActionResult[]> {
  const results: HardeningActionResult[] = [];
  let webRoot: string | null = null;

  for (const action of actions) {
    try {
      // Resolve web root lazily (only once, on first env action)
      if (webRoot === null) {
        webRoot = await resolveWebRoot(exec, rootPath);
      }

      switch (action) {
        case "BLOCK_PHP_UPLOADS":
          results.push(await blockPhpUploads(exec, webRoot));
          break;
        case "BLOCK_XMLRPC":
          results.push(await blockXmlrpc(exec, webRoot));
          break;
        case "BLOCK_VERSION_DISCLOSURE":
          results.push(await blockVersionDisclosure(exec, webRoot));
          break;
        case "ADD_SECURITY_HEADERS":
          results.push(await addSecurityHeaders(exec, webRoot));
          break;
        case "DISABLE_DIRECTORY_LISTING":
          results.push(await disableDirectoryListing(exec, webRoot));
          break;
        case "DELETE_PHP_UPLOAD_FILES":
          results.push(await deletePhpUploadFilesEnv(exec, webRoot));
          break;
        case "CLEAN_HTACCESS_REDIRECTS":
          results.push(await cleanHtaccessRedirectsEnv(exec, webRoot));
          break;
        case "BLOCK_DEBUG_LOG":
          results.push(await blockDebugLog(exec, webRoot));
          break;
        case "BLOCK_SENSITIVE_FILES":
          results.push(await blockSensitiveFiles(exec, webRoot));
          break;
        case "DISABLE_FILE_EDITOR":
          results.push(await disableFileEditor(exec, webRoot, rootPath));
          break;
        case "BLOCK_USER_ENUMERATION":
          results.push(await blockUserEnumeration(exec, webRoot));
          break;
        case "FORCE_REINSTALL_CORE":
          results.push(await forceReinstallCore(exec, webRoot));
          break;
        case "UPDATE_ALL_PLUGINS":
          results.push(await updateAllPlugins(exec, webRoot));
          break;
        default: {
          const _exhaustive: never = action;
          results.push(fail(_exhaustive as string, "Unknown action"));
        }
      }
    } catch (err) {
      results.push(
        fail(action, err instanceof Error ? err.message : String(err)),
      );
    }
  }

  return results;
}
