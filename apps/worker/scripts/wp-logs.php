<?php
/**
 * wp-logs.php — Fetch log file lines
 *
 * Args:
 *   --docroot   Absolute path to WordPress root
 *   --type      debug | php | nginx | apache  (default: debug)
 *   --lines     Number of tail lines (default: 100, max: 500)
 *
 * Output: JSON { success, file, lines: string[] }
 */

$opts    = getopt('', ['docroot:', 'type:', 'lines:']);
$docroot = rtrim($opts['docroot'] ?? '', '/');
$type    = $opts['type'] ?? 'debug';
$lines   = min((int)($opts['lines'] ?? 100), 500);

if (!$docroot || !is_dir($docroot)) {
    out(false, '', [], 'Missing or invalid --docroot');
}

$file = resolveLogFile($docroot, $type);
if (!$file || !file_exists($file)) {
    out(false, $file ?? '', [], "Log file not found for type=$type");
}

$tail = tailFile($file, $lines);
out(true, $file, $tail);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveLogFile(string $docroot, string $type): ?string {
    switch ($type) {
        case 'debug':
            return $docroot . '/wp-content/debug.log';
        case 'php':
            // Check common PHP error log locations
            $ini = ini_get('error_log');
            if ($ini && file_exists($ini)) return $ini;
            foreach (['/var/log/php_errors.log', '/var/log/php-fpm/error.log', '/var/log/php/error.log'] as $p) {
                if (file_exists($p)) return $p;
            }
            // Try glob
            $found = glob('/var/log/php*error.log') ?: [];
            return $found[0] ?? null;
        case 'nginx':
            foreach (['/var/log/nginx/error.log', '/var/log/nginx/access.log'] as $p) {
                if (file_exists($p)) return $p;
            }
            return null;
        case 'apache':
            foreach (['/var/log/apache2/error.log', '/var/log/httpd/error_log', '/var/log/apache2/access.log'] as $p) {
                if (file_exists($p)) return $p;
            }
            return null;
        default:
            return null;
    }
}

function tailFile(string $file, int $n): array {
    // Use system tail for efficiency
    $cmd    = 'tail -n ' . (int)$n . ' ' . escapeshellarg($file) . ' 2>&1';
    $output = [];
    exec($cmd, $output);
    return $output;
}

function out(bool $success, string $file, array $lines, string $error = ''): never {
    $r = ['success' => $success, 'file' => $file, 'lines' => $lines];
    if ($error) $r['error'] = $error;
    echo json_encode($r);
    exit($success ? 0 : 1);
}
