<?php
/**
 * wp-cron.php — Read scheduled WP cron jobs via MySQL
 *
 * Args:
 *   --docroot   Absolute path to WordPress root
 *
 * Output: JSON array of { hook, schedule, next_run, next_run_timestamp, args }
 */

$opts    = getopt('', ['docroot:']);
$docroot = rtrim($opts['docroot'] ?? '', '/');

if (!$docroot || !is_dir($docroot)) {
    echo json_encode(['success' => false, 'error' => 'Missing or invalid --docroot']);
    exit(1);
}

$db = loadDb($docroot);
if (!$db) {
    echo json_encode(['success' => false, 'error' => 'Could not load DB credentials']);
    exit(1);
}

$prefix = $db['prefix'];

// Try WP-CLI first (most reliable)
$wpCli = findWpCli($docroot);
if ($wpCli) {
    $cmd = escapeshellarg($wpCli) . ' cron schedule list --path=' . escapeshellarg($docroot) . ' --format=json 2>&1';
    exec($cmd, $wpcliOut, $rc);
    if ($rc === 0) {
        $schedules = json_decode(implode('', $wpcliOut), true);
        if (is_array($schedules)) {
            echo json_encode(['success' => true, 'source' => 'wpcli', 'cron' => $schedules]);
            exit(0);
        }
    }
}

// SQL fallback — read cron option directly from DB
try {
    $pdo = connectPdo($db);
    $row = $pdo->query("SELECT option_value FROM `{$prefix}options` WHERE option_name = 'cron' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        echo json_encode(['success' => false, 'error' => 'cron option not found in DB']);
        exit(1);
    }
    $cron = @unserialize($row['option_value']);
    if (!is_array($cron)) {
        echo json_encode(['success' => false, 'error' => 'Failed to unserialize cron option']);
        exit(1);
    }

    $result = [];
    foreach ($cron as $timestamp => $hooks) {
        if (!is_array($hooks)) continue;
        foreach ($hooks as $hook => $events) {
            foreach ($events as $event) {
                $result[] = [
                    'hook'               => $hook,
                    'schedule'           => $event['schedule'] ?? 'once',
                    'next_run'           => date('Y-m-d H:i:s', (int)$timestamp),
                    'next_run_timestamp' => (int)$timestamp,
                    'args'               => $event['args'] ?? [],
                ];
            }
        }
    }
    usort($result, fn($a, $b) => $a['next_run_timestamp'] - $b['next_run_timestamp']);
    echo json_encode(['success' => true, 'source' => 'sql', 'cron' => $result]);
    exit(0);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadDb(string $docroot): ?array {
    foreach (['.env', '.env.local'] as $f) {
        $envPath = $docroot . '/' . $f;
        if (file_exists($envPath)) {
            $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            $vars = [];
            foreach ($lines as $line) {
                if (str_starts_with(trim($line), '#')) continue;
                [$k, $v] = array_pad(explode('=', $line, 2), 2, '');
                $vars[trim($k)] = trim($v, " \t\n\r\"'");
            }
            if (!empty($vars['DB_NAME'])) {
                return [
                    'host'   => $vars['DB_HOST'] ?? '127.0.0.1',
                    'port'   => $vars['DB_PORT'] ?? '3306',
                    'user'   => $vars['DB_USER'] ?? $vars['DB_USERNAME'] ?? 'root',
                    'pass'   => $vars['DB_PASSWORD'] ?? $vars['DB_PASS'] ?? '',
                    'name'   => $vars['DB_NAME'],
                    'prefix' => $vars['table_prefix'] ?? 'wp_',
                ];
            }
        }
    }
    $wpConfig = $docroot . '/wp-config.php';
    if (file_exists($wpConfig)) {
        $content = file_get_contents($wpConfig);
        preg_match("/define\s*\(\s*['\"]DB_NAME['\"]\s*,\s*['\"]([^'\"]+)['\"]/", $content, $nm);
        preg_match("/define\s*\(\s*['\"]DB_USER['\"]\s*,\s*['\"]([^'\"]+)['\"]/", $content, $usr);
        preg_match("/define\s*\(\s*['\"]DB_PASSWORD['\"]\s*,\s*['\"]([^'\"]+)['\"]/", $content, $pw);
        preg_match("/define\s*\(\s*['\"]DB_HOST['\"]\s*,\s*['\"]([^'\"]+)['\"]/", $content, $host);
        preg_match("/\\\$table_prefix\s*=\s*['\"]([^'\"]+)['\"]/", $content, $pfx);
        if (!empty($nm[1])) {
            $hostVal = $host[1] ?? '127.0.0.1';
            $port    = '3306';
            if (str_contains($hostVal, ':')) [$hostVal, $port] = explode(':', $hostVal, 2);
            return [
                'host'   => $hostVal,
                'port'   => $port,
                'user'   => $usr[1]  ?? 'root',
                'pass'   => $pw[1]   ?? '',
                'name'   => $nm[1],
                'prefix' => $pfx[1]  ?? 'wp_',
            ];
        }
    }
    return null;
}

function findWpCli(string $docroot): ?string {
    foreach ([$docroot . '/vendor/bin/wp', '/usr/local/bin/wp', '/usr/bin/wp'] as $c) {
        if (is_executable($c)) return $c;
    }
    $which = trim(shell_exec('which wp 2>/dev/null') ?? '');
    return $which ?: null;
}

function connectPdo(array $db): PDO {
    $dsn = "mysql:host={$db['host']};port={$db['port']};dbname={$db['name']};charset=utf8mb4";
    return new PDO($dsn, $db['user'], $db['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 10,
    ]);
}
