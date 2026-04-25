<?php
/**
 * Bedrock Forge — WP user scanner
 * Usage: php wp-users.php --docroot=/path/to/wp
 *
 * Outputs a JSON object:  { "users": [...] }
 * Reads DB credentials via regex parsing only (no eval/exec of config files).
 */

declare(strict_types=1);

$opts    = getopt('', ['docroot:']);
$docroot = rtrim((string)($opts['docroot'] ?? ''), '/');

if ($docroot === '') {
    echo json_encode(['error' => 'Missing --docroot argument']);
    exit(1);
}

$envFile   = '';
$wpConfig  = '';

// Search docroot + up to 2 parent levels for .env and wp-config.php.
// This handles both:
//   root_path = /site/       (Bedrock project root: .env is here)
//   root_path = /site/web/   (Bedrock web root:     .env is one level up)
$searchDirs = [$docroot, $docroot . '/..', $docroot . '/../..'];
foreach ($searchDirs as $dir) {
    $real = realpath($dir);
    if ($real === false) continue;
    if ($envFile === '' && file_exists($real . '/.env')) {
        $preview = (string)@file_get_contents($real . '/.env', false, null, 0, 512);
        if (str_contains($preview, 'DB_HOST') || str_contains($preview, 'DATABASE_URL')) {
            $envFile = $real . '/.env';
        }
    }
    if ($wpConfig === '' && file_exists($real . '/wp-config.php')) {
        $wpConfig = $real . '/wp-config.php';
    }
}

if ($envFile === '' && $wpConfig === '') {
    echo json_encode(['error' => 'No .env or wp-config.php found at docroot or parent directories']);
    exit(1);
}

$dbHost      = '';
$dbUser      = '';
$dbPass      = '';
$dbName      = '';
$tablePrefix = 'wp_';

// ── Helper: extract a single key's value from a .env line ────────────────────
function parseEnvValue(string $line, string $key): ?string {
    $k = preg_quote($key, '/');
    // Double-quoted: KEY="value" (supports backslash escapes inside)
    if (preg_match('/^' . $k . '\s*=\s*"((?:[^"\\\\]|\\\\.)*)"/', $line, $m)) {
        return stripcslashes($m[1]);
    }
    // Single-quoted: KEY='value' (no escape processing)
    if (preg_match('/^' . $k . "\s*=\s*'([^']*)'/", $line, $m)) {
        return $m[1];
    }
    // Unquoted: KEY=value  (ends at whitespace or # comment)
    if (preg_match('/^' . $k . '\s*=\s*([^"\'#\r\n\s]+)/', $line, $m)) {
        return $m[1];
    }
    // Explicitly empty: KEY=
    if (preg_match('/^' . $k . '\s*=\s*$/', $line)) {
        return '';
    }
    return null;
}

// ── Parse .env ────────────────────────────────────────────────────────────────
if ($envFile !== '') {
    $lines = @file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        echo json_encode(['error' => 'Cannot read .env file']);
        exit(1);
    }
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        if (($v = parseEnvValue($line, 'DB_HOST'))     !== null) $dbHost = $v;
        if (($v = parseEnvValue($line, 'DB_USER'))     !== null) $dbUser = $v;
        if (($v = parseEnvValue($line, 'DB_PASSWORD')) !== null) $dbPass = $v;
        if (($v = parseEnvValue($line, 'DB_NAME'))     !== null) $dbName = $v;
        // DATABASE_URL=mysql://user:pass@host[:port]/dbname
        if ($dbHost === '' && preg_match(
            '/^DATABASE_URL\s*=\s*["\']?mysql:\/\/([^:@\/\s]+):([^@\/\s]*)@([^\/:"\'#\s]+)(?::\d+)?\/([^"\'?#\s\/]+)/i',
            $line, $m
        )) {
            $dbUser = urldecode($m[1]);
            $dbPass = urldecode($m[2]);
            $dbHost = $m[3];
            $dbName = $m[4];
        }
    }
}

// ── Parse wp-config.php (fallback or supplement) ─────────────────────────────
if (($dbHost === '' || $dbUser === '' || $dbName === '') && $wpConfig !== '') {
    $content = (string)@file_get_contents($wpConfig);
    // Only extract string literal defines — skip env() style
    if (preg_match("/define\s*\(\s*['\"]DB_HOST['\"]\s*,\s*['\"]([^'\"]+)['\"]/",     $content, $m)) $dbHost = $m[1];
    if (preg_match("/define\s*\(\s*['\"]DB_USER['\"]\s*,\s*['\"]([^'\"]+)['\"]/",     $content, $m)) $dbUser = $m[1];
    if (preg_match("/define\s*\(\s*['\"]DB_PASSWORD['\"]\s*,\s*['\"]([^'\"]+)['\"]/", $content, $m)) $dbPass = $m[1];
    if (preg_match("/define\s*\(\s*['\"]DB_NAME['\"]\s*,\s*['\"]([^'\"]+)['\"]/",     $content, $m)) $dbName = $m[1];
    if (preg_match('/\$table_prefix\s*=\s*[\'"]([^\'"]+)[\'"]/', $content, $m)) $tablePrefix = $m[1];
}

if ($dbHost === '' || $dbUser === '' || $dbName === '') {
    echo json_encode(['error' => 'Could not parse DB credentials from config file']);
    exit(1);
}

// ── Connect via PDO ───────────────────────────────────────────────────────────

try {
    $dsn = "mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4";
    $pdo = new PDO($dsn, $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT            => 10,
    ]);
} catch (PDOException $e) {
    echo json_encode(['error' => 'DB connection failed: ' . $e->getMessage()]);
    exit(1);
}

$usersTable = $tablePrefix . 'users';
$metaTable  = $tablePrefix . 'usermeta';
$capsKey    = $tablePrefix . 'capabilities';

try {
    $stmt = $pdo->prepare(
        "SELECT u.ID, u.user_login, u.user_email, u.display_name, u.user_registered,
                m.meta_value AS capabilities
         FROM `{$usersTable}` u
         LEFT JOIN `{$metaTable}` m ON m.user_id = u.ID AND m.meta_key = :capsKey
         ORDER BY u.ID"
    );
    $stmt->execute(['capsKey' => $capsKey]);
    $rows = $stmt->fetchAll();
} catch (PDOException $e) {
    echo json_encode(['error' => 'Query failed: ' . $e->getMessage()]);
    exit(1);
}

$users = [];
foreach ($rows as $row) {
    $caps  = @unserialize((string)($row['capabilities'] ?? ''));
    $roles = (is_array($caps)) ? array_keys(array_filter($caps)) : [];
    $users[] = [
        'id'              => (int)$row['ID'],
        'user_login'      => $row['user_login'],
        'user_email'      => $row['user_email'],
        'display_name'    => $row['display_name'],
        'user_registered' => $row['user_registered'],
        'roles'           => $roles,
    ];
}

echo json_encode(['users' => $users], JSON_PRETTY_PRINT);
