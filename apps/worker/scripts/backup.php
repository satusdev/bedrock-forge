#!/usr/bin/env php
<?php
/**
 * backup.php — Bedrock Forge remote backup script
 * Usage: php backup.php --docroot=/var/www/site --type=full|database|files [--output=/tmp/backup.tar.gz]
 * Outputs JSON: {"filename":"/path/to/file","size":12345}
 */

$opts = getopt('', ['docroot:', 'type:', 'output:', 'restore', 'file:']);

$docroot = $opts['docroot'] ?? null;
$type    = $opts['type'] ?? 'full';
$output  = $opts['output'] ?? '/tmp/forge_backup_' . time() . '.tar.gz';
$restore = isset($opts['restore']);
$file    = $opts['file'] ?? null;

if (!$docroot || !is_dir($docroot)) {
    fwrite(STDERR, "ERROR: Invalid or missing --docroot\n");
    exit(1);
}

if ($restore) {
    if (!$file || !file_exists($file)) {
        fwrite(STDERR, "ERROR: --file must point to an existing backup archive\n");
        exit(1);
    }
    $cmd = "tar -xzf " . escapeshellarg($file) . " -C " . escapeshellarg($docroot) . " 2>&1";
    exec($cmd, $out, $code);
    if ($code !== 0) {
        fwrite(STDERR, "ERROR: restore failed: " . implode("\n", $out) . "\n");
        exit($code);
    }
    echo json_encode(['status' => 'restored', 'file' => $file]);
    exit(0);
}

// Parse wp-config.php for DB credentials
function parseWpConfig(string $docroot): array {
    $configFile = $docroot . '/wp-config.php';
    if (!file_exists($configFile)) {
        // Try Bedrock style
        $configFile = $docroot . '/config/application.php';
    }
    if (!file_exists($configFile)) return [];

    $content = file_get_contents($configFile);
    $creds = [];
    foreach (['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST'] as $const) {
        if (preg_match("/define\s*\(\s*['\"]" . $const . "['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)/", $content, $m)) {
            $creds[$const] = $m[1];
        } elseif (preg_match('/' . $const . '\s*=\s*[\'"]([^\'"]+)[\'"]/', $content, $m)) {
            $creds[$const] = $m[1];
        }
    }
    return $creds;
}

$parts        = [];
$dbDumpFile   = null;

if ($type === 'full' || $type === 'database') {
    $creds = parseWpConfig($docroot);
    if (empty($creds['DB_NAME'])) {
        fwrite(STDERR, "ERROR: Could not parse DB credentials from wp-config.php\n");
        exit(1);
    }
    $dbDumpFile = sys_get_temp_dir() . '/forge_db_' . time() . '.sql';
    $cmd = sprintf(
        'mysqldump -h%s -u%s -p%s %s > %s 2>&1',
        escapeshellarg($creds['DB_HOST'] ?? 'localhost'),
        escapeshellarg($creds['DB_USER']),
        escapeshellarg($creds['DB_PASSWORD']),
        escapeshellarg($creds['DB_NAME']),
        escapeshellarg($dbDumpFile)
    );
    exec($cmd, $out, $code);
    if ($code !== 0) {
        fwrite(STDERR, "ERROR: mysqldump failed: " . implode("\n", $out) . "\n");
        exit($code);
    }
    $parts[] = $dbDumpFile;
}

$tarCmd = 'tar -czf ' . escapeshellarg($output);

if ($type === 'full' || $type === 'files') {
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

if ($code !== 0) {
    fwrite(STDERR, "ERROR: tar failed: " . implode("\n", $out) . "\n");
    exit($code);
}

$size = file_exists($output) ? filesize($output) : 0;
echo json_encode(['filename' => $output, 'size' => $size]);
exit(0);
