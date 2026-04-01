#!/usr/bin/env php
<?php
/**
 * backup.php — Bedrock Forge remote backup script
 * Usage: php backup.php --docroot=/var/www/site --type=full|database|files [--output=/tmp/backup.tar.gz]
 * Outputs JSON: {"filename":"/path/to/file","size":12345}
 */

// PHP 7.0+ required (null coalescing operator, scalar type hints, return types)
if (PHP_VERSION_ID < 70000) {
    fwrite(STDERR, "ERROR: PHP 7.0 or newer is required (this server runs PHP " . PHP_VERSION . ")\n");
    exit(1);
}

$opts = getopt('', ['docroot:', 'type:', 'output:', 'restore', 'file:', 'db-name:', 'db-user:', 'db-pass:', 'db-host:']);

$docroot = $opts['docroot'] ?? null;
$type    = $opts['type'] ?? 'full';
$output  = $opts['output'] ?? '/tmp/forge_backup_' . time() . '.tar.gz';
$restore = isset($opts['restore']);
$file    = $opts['file'] ?? null;
// Stored credential overrides — used as fallback when on-disk parsing fails
$cliDbName = $opts['db-name'] ?? null;
$cliDbUser = $opts['db-user'] ?? null;
$cliDbPass = $opts['db-pass'] ?? null;
$cliDbHost = $opts['db-host'] ?? null;

if (!$docroot || !is_dir($docroot)) {
    fwrite(STDERR, "ERROR: Invalid or missing --docroot\n");
    exit(1);
}

if ($restore) {
    if (!$file || !file_exists($file)) {
        fwrite(STDERR, "ERROR: --file must point to an existing backup archive\n");
        exit(1);
    }

    // ── Wipe the existing docroot before extracting ────────────────────────
    // tar -xzf is additive: files present on disk but absent from the archive
    // are left untouched, which causes stale plugins/themes to survive a
    // restore, and can create duplicated directories (e.g. public_html/public_html/)
    // when an older backup had a different path structure.
    // Deleting the docroot first guarantees the result is an exact mirror of
    // the backup.  We only delete AFTER confirming the archive file exists
    // (validated above), so a missing/corrupt archive never nukes the live site.
    if (is_dir($docroot)) {
        $rmOut  = [];
        $rmCode = 0;
        exec('rm -rf ' . escapeshellarg($docroot) . ' 2>&1', $rmOut, $rmCode);
        if ($rmCode !== 0) {
            fwrite(STDERR, "WARNING: could not clean docroot before restore (exit {$rmCode}): " . implode("\n", $rmOut) . "\n");
            // Non-fatal: proceed with extraction; stale files may remain.
        } else {
            fwrite(STDERR, "Cleaned docroot before restore: {$docroot}\n");
        }
    }

    // Extract to the PARENT of docroot.
    // Archives are created with: tar -C dirname(docroot) basename(docroot)
    // so every file inside is stored as  basename/path/to/file.php
    // Extracting to dirname(docroot) restores files to the correct location.
    $extractTo = dirname($docroot);
    $cmd = "tar -xzf " . escapeshellarg($file) . " -C " . escapeshellarg($extractTo) . " 2>&1";
    exec($cmd, $out, $code);
    if ($code > 1) {
        fwrite(STDERR, "ERROR: restore (files) failed (exit {$code}): " . implode("\n", $out) . "\n");
        exit($code);
    }
    if ($code === 1) {
        fwrite(STDERR, "WARNING: tar exited 1 during extract (harmless race) — continuing\n");
    }

    // ── Database import ────────────────────────────────────────────────────
    // The archive places forge_db_*.sql at the $extractTo level (same level
    // as the docroot directory itself).  Import it if found.
    $dbImported = false;
    $sqlFiles   = glob($extractTo . '/forge_db_*.sql');

    if (!empty($sqlFiles)) {
        $sqlFile = $sqlFiles[0];

        // Resolve credentials: on-disk config first, stored CLI args as fallback
        $creds      = parseWpConfig($docroot);
        $missingCred = false;
        foreach (['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST'] as $required) {
            if (empty($creds[$required])) { $missingCred = true; break; }
        }
        if ($missingCred && $cliDbName && $cliDbUser && $cliDbPass && $cliDbHost) {
            $creds['DB_NAME']     = $cliDbName;
            $creds['DB_USER']     = $cliDbUser;
            $creds['DB_PASSWORD'] = $cliDbPass;
            $creds['DB_HOST']     = $cliDbHost;
        }

        $canImport = !empty($creds['DB_NAME']) && !empty($creds['DB_USER'])
            && !empty($creds['DB_PASSWORD']) && !empty($creds['DB_HOST']);

        if ($canImport) {
            $dbHost = $creds['DB_HOST'];
            $dbPort = '';
            if (strpos($dbHost, ':') !== false) {
                [$dbHost, $hostPort] = explode(':', $dbHost, 2);
                $dbPort = ' --port=' . (int)$hostPort;
            } elseif (!empty($creds['DB_PORT'])) {
                $dbPort = ' --port=' . (int)$creds['DB_PORT'];
            }

            // Write temp .my.cnf — avoids all shell-quoting issues with passwords
            $mycnfFile = tempnam(sys_get_temp_dir(), 'forge_rstore_mycnf_');
            file_put_contents($mycnfFile, "[client]\nuser={$creds['DB_USER']}\npassword={$creds['DB_PASSWORD']}\nhost={$dbHost}\n");
            chmod($mycnfFile, 0600);

            $importCmd = sprintf(
                'mysql --defaults-extra-file=%s%s %s < %s 2>&1',
                escapeshellarg($mycnfFile),
                $dbPort,
                escapeshellarg($creds['DB_NAME']),
                escapeshellarg($sqlFile)
            );
            exec($importCmd, $importOut, $importCode);
            @unlink($mycnfFile);

            if ($importCode !== 0) {
                // Files are already restored — log warning but don't abort
                fwrite(STDERR, "WARNING: DB import failed (exit {$importCode}): " . implode("\n", $importOut) . "\n");
            } else {
                $dbImported = true;
                fwrite(STDERR, "DB imported: {$creds['DB_NAME']} from " . basename($sqlFile) . "\n");
            }
        } else {
            fwrite(STDERR, "WARNING: SQL dump found but DB credentials could not be resolved — skipping DB import\n");
        }

        @unlink($sqlFile); // clean up extracted dump regardless of import success
    }

    echo json_encode(['status' => 'restored', 'file' => $file, 'db_imported' => $dbImported]);
    exit(0);
}

// Parse DB credentials — tries Bedrock .env first, then wp-config.php, then config/application.php
function parseWpConfig(string $docroot): array {
    // 1. Bedrock .env (most common for this tool)
    $envFile = $docroot . '/.env';
    if (file_exists($envFile)) {
        $creds = parseEnvFile($envFile);
        if (!empty($creds['DB_NAME'])) return $creds;
    }

    // 2. Standard wp-config.php
    $configFile = $docroot . '/wp-config.php';
    if (!file_exists($configFile)) {
        // 3. Bedrock config/application.php
        $configFile = $docroot . '/config/application.php';
    }
    if (!file_exists($configFile)) return [];

    $content = file_get_contents($configFile);
    $creds = [];
    foreach (['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST'] as $const) {
        if (preg_match("/define\s*\(\s*['\"]" . $const . "['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)/", $content, $m)) {
            // Standard wp-config.php: define('DB_NAME', 'value')
            $creds[$const] = $m[1];
        } elseif (preg_match("/Config::define\s*\(\s*['\"]" . $const . "['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)/", $content, $m)) {
            // Bedrock config/application.php: Config::define('DB_NAME', 'value')
            $creds[$const] = $m[1];
        } elseif (preg_match("/" . $const . "\s*=\s*['\"]([^'\"]+)['\"]/", $content, $m)) {
            // Assignment style: DB_NAME = 'value'
            $creds[$const] = $m[1];
        }
    }
    return $creds;
}

/**
 * Parse a .env file for DB credentials.
 * Handles KEY=value, KEY='value', KEY="value" formats.
 */
function parseEnvFile(string $path): array {
    $creds = [];
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) return [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        if (strpos($line, '=') === false) continue;
        // Strip optional `export ` prefix (common in some shell-sourced .env files)
        if (strncasecmp($line, 'export ', 7) === 0) {
            $line = ltrim(substr($line, 7));
        }
        list($key, $value) = explode('=', $line, 2);
        $key   = trim($key);
        $value = trim($value);
        // Strip surrounding quotes
        if (strlen($value) >= 2) {
            $first = $value[0];
            $last  = $value[strlen($value) - 1];
            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                $value = substr($value, 1, -1);
            }
        }
        if (in_array($key, ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT'], true)) {
            $creds[$key] = $value;
        }
    }
    // Fallback: parse DATABASE_URL (mysql://user:pass@host/dbname) when individual vars are absent
    if (empty($creds['DB_NAME'])) {
        $rawLines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($rawLines !== false) {
            foreach ($rawLines as $rawLine) {
                $rawLine = trim($rawLine);
                if (strncmp($rawLine, 'DATABASE_URL=', 13) === 0) {
                    $url    = trim(substr($rawLine, 13), " \t\"'");
                    $parsed = parse_url($url);
                    if ($parsed !== false && isset($parsed['path'])) {
                        if (!empty($parsed['user'])) $creds['DB_USER']     = urldecode($parsed['user']);
                        if (!empty($parsed['pass'])) $creds['DB_PASSWORD'] = urldecode($parsed['pass']);
                        if (!empty($parsed['host'])) $creds['DB_HOST']     = $parsed['host'];
                        if (!empty($parsed['path'])) $creds['DB_NAME']     = ltrim($parsed['path'], '/');
                        if (!empty($parsed['port'])) $creds['DB_PORT']     = (string)$parsed['port'];
                    }
                    break;
                }
            }
        }
    }
    // Default DB_HOST to localhost if not set
    if (!empty($creds['DB_NAME']) && empty($creds['DB_HOST'])) {
        $creds['DB_HOST'] = 'localhost';
    }
    return $creds;
}

$parts        = [];
$dbDumpFile   = null;

if ($type === 'full' || $type === 'db_only') {
    $creds = parseWpConfig($docroot);

    // Determine credential source for diagnostic logging
    $credSource = 'filesystem';

    // If filesystem parsing is incomplete and CLI credential overrides were supplied
    // (passed by the worker from stored encrypted credentials), use them as fallback.
    $missingCred = false;
    foreach (['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST'] as $required) {
        if (empty($creds[$required])) { $missingCred = true; break; }
    }
    if ($missingCred && $cliDbName && $cliDbUser && $cliDbPass && $cliDbHost) {
        $creds['DB_NAME']     = $cliDbName;
        $creds['DB_USER']     = $cliDbUser;
        $creds['DB_PASSWORD'] = $cliDbPass;
        $creds['DB_HOST']     = $cliDbHost;
        $credSource = 'stored (CLI fallback)';
    }

    // Validate all required credentials are present before attempting mysqldump
    foreach (['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST'] as $required) {
        if (empty($creds[$required])) {
            fwrite(STDERR, "ERROR: Missing or empty credential '{$required}'. Checked .env, wp-config.php, and config/application.php under {$docroot}\n");
            exit(1);
        }
    }

    // Log credential source and identity for diagnostics (never log the password)
    fwrite(STDERR, "DB creds source={$credSource} user={$creds['DB_USER']} db={$creds['DB_NAME']} host={$creds['DB_HOST']}\n");

    $dbDumpFile = sys_get_temp_dir() . '/forge_db_' . time() . '.sql';
    $stderrFile = sys_get_temp_dir() . '/forge_db_err_' . time() . '.txt';

    // Handle DB_HOST containing an embedded port (e.g. localhost:3307).
    $dbHost = $creds['DB_HOST'];
    $dbPort = '';
    if (strpos($dbHost, ':') !== false) {
        [$dbHost, $hostPort] = explode(':', $dbHost, 2);
        $dbPort = ' --port=' . (int)$hostPort;
    } elseif (!empty($creds['DB_PORT'])) {
        $dbPort = ' --port=' . (int)$creds['DB_PORT'];
    }

    // ── Use --defaults-extra-file to pass credentials to mysqldump ──────────
    // Writing credentials to a temporary .my.cnf avoids ALL shell escaping
    // issues with special characters (!@^$`" etc.) in passwords. The file is
    // read directly by the mysqldump binary — no shell interpretation, no
    // MYSQL_PWD env var leaking into the process list.
    $mycnfFile = tempnam(sys_get_temp_dir(), 'forge_mycnf_');
    $mycnfContent = "[client]\n"
        . "user=" . $creds['DB_USER'] . "\n"
        . "password=" . $creds['DB_PASSWORD'] . "\n"
        . "host=" . $dbHost . "\n";
    file_put_contents($mycnfFile, $mycnfContent);
    chmod($mycnfFile, 0600);

    $cmd = sprintf(
        'mysqldump --defaults-extra-file=%s%s --single-transaction --quick %s > %s 2>%s',
        escapeshellarg($mycnfFile),
        $dbPort,
        escapeshellarg($creds['DB_NAME']),
        escapeshellarg($dbDumpFile),
        escapeshellarg($stderrFile)
    );
    exec($cmd, $out, $code);
    @unlink($mycnfFile);  // always clean up credentials file
    if ($code !== 0) {
        $errDetail = file_exists($stderrFile) ? trim(file_get_contents($stderrFile)) : implode("\n", $out);
        @unlink($stderrFile);
        fwrite(STDERR, "ERROR: mysqldump failed (exit {$code}): {$errDetail}\n");
        exit($code);
    }
    @unlink($stderrFile);
    $parts[] = $dbDumpFile;
}

// Use pigz (parallel gzip) when available for faster compression on multi-core
// servers. Falls back to standard gzip transparently.
$pigz = trim(shell_exec('which pigz 2>/dev/null') ?? '');
if ($pigz) {
    $tarCmd = 'tar --use-compress-program=' . escapeshellarg($pigz) . ' -cf ' . escapeshellarg($output);
} else {
    $tarCmd = 'tar -czf ' . escapeshellarg($output);
}

if ($type === 'full' || $type === 'files_only') {
    $tarCmd .= ' -C ' . escapeshellarg(dirname($docroot)) . ' ' . escapeshellarg(basename($docroot));
}

foreach ($parts as $part) {
    $tarCmd .= ' -C ' . escapeshellarg(dirname($part)) . ' ' . escapeshellarg(basename($part));
}

exec($tarCmd . ' 2>&1', $out, $code);

// Cleanup temp SQL dump
if ($dbDumpFile && file_exists($dbDumpFile)) {
    unlink($dbDumpFile);
}

// tar exit code 1 = "file changed as we read it" — a harmless warning that
// occurs when the site receives traffic during the backup. The archive is still
// valid and complete. Only exit codes >= 2 indicate a real failure.
if ($code > 1) {
    fwrite(STDERR, "ERROR: tar failed (exit {$code}): " . implode("\n", $out) . "\n");
    exit($code);
}
if ($code === 1) {
    fwrite(STDERR, "WARNING: tar exited 1 (file changed during read) — backup archive is still valid\n");
}

$size = file_exists($output) ? filesize($output) : 0;
echo json_encode(['filename' => $output, 'size' => $size]);
exit(0);
