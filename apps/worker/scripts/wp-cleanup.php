<?php
/**
 * wp-cleanup.php — WordPress database cleanup
 *
 * Args:
 *   --docroot   Absolute path to WordPress root
 *   --dry-run   If present, only count — do NOT delete
 *
 * Cleans:
 *   - Post revisions (keep the most recent 3 per post)
 *   - Expired transients
 *   - Spam comments
 *   - Orphaned postmeta (meta for deleted posts)
 *
 * Output: JSON { success, dry_run, counts: { revisions, transients, spam_comments, orphaned_postmeta } }
 */

$args    = getopt('', ['docroot:', 'dry-run']);
$docroot = rtrim($args['docroot'] ?? '', '/');
$dryRun  = array_key_exists('dry-run', $args);

if (!$docroot || !is_dir($docroot)) {
    echo json_encode(['success' => false, 'error' => 'Missing or invalid --docroot']);
    exit(1);
}

$db = loadDb($docroot);
if (!$db) {
    echo json_encode(['success' => false, 'error' => 'Could not load DB credentials']);
    exit(1);
}

try {
    $pdo    = connectPdo($db);
    $prefix = $db['prefix'];
    $counts = [];

    // ── 1. Post revisions — keep the 3 most recent per post ─────────────────
    // Count revisions excluding the 3 most recent per parent
    $revCount = (int)$pdo->query(
        "SELECT COUNT(*) FROM `{$prefix}posts` r
         WHERE r.post_type = 'revision'
           AND r.ID NOT IN (
               SELECT id FROM (
                   SELECT ID as id
                   FROM `{$prefix}posts`
                   WHERE post_type = 'revision'
                     AND post_parent = r.post_parent
                   ORDER BY post_date DESC
                   LIMIT 3
               ) sub
           )"
    )->fetchColumn();
    $counts['revisions'] = $revCount;
    if (!$dryRun && $revCount > 0) {
        $pdo->exec(
            "DELETE r FROM `{$prefix}posts` r
             WHERE r.post_type = 'revision'
               AND r.ID NOT IN (
                   SELECT id FROM (
                       SELECT ID as id
                       FROM `{$prefix}posts` inner_r
                       WHERE inner_r.post_type = 'revision'
                         AND inner_r.post_parent = r.post_parent
                       ORDER BY post_date DESC
                       LIMIT 3
                   ) sub
               )"
        );
    }

    // ── 2. Expired transients ────────────────────────────────────────────────
    $now = time();
    $transCount = (int)$pdo->query(
        "SELECT COUNT(*) FROM `{$prefix}options`
         WHERE option_name LIKE '_transient_timeout_%'
           AND CAST(option_value AS UNSIGNED) < $now"
    )->fetchColumn();
    $counts['transients'] = $transCount;
    if (!$dryRun && $transCount > 0) {
        // Delete the timeout row + the matching value row
        $pdo->exec(
            "DELETE FROM `{$prefix}options`
             WHERE option_name IN (
                 SELECT * FROM (
                     SELECT REPLACE(option_name, '_transient_timeout_', '_transient_') as n
                     FROM `{$prefix}options`
                     WHERE option_name LIKE '_transient_timeout_%'
                       AND CAST(option_value AS UNSIGNED) < $now
                     UNION ALL
                     SELECT option_name
                     FROM `{$prefix}options`
                     WHERE option_name LIKE '_transient_timeout_%'
                       AND CAST(option_value AS UNSIGNED) < $now
                 ) sub
             )"
        );
    }

    // ── 3. Spam comments ─────────────────────────────────────────────────────
    $spamCount = (int)$pdo->query(
        "SELECT COUNT(*) FROM `{$prefix}comments` WHERE comment_approved = 'spam'"
    )->fetchColumn();
    $counts['spam_comments'] = $spamCount;
    if (!$dryRun && $spamCount > 0) {
        $pdo->exec("DELETE FROM `{$prefix}comments` WHERE comment_approved = 'spam'");
    }

    // ── 4. Orphaned postmeta ─────────────────────────────────────────────────
    $orphanCount = (int)$pdo->query(
        "SELECT COUNT(*) FROM `{$prefix}postmeta` pm
         LEFT JOIN `{$prefix}posts` p ON p.ID = pm.post_id
         WHERE p.ID IS NULL"
    )->fetchColumn();
    $counts['orphaned_postmeta'] = $orphanCount;
    if (!$dryRun && $orphanCount > 0) {
        $pdo->exec(
            "DELETE pm FROM `{$prefix}postmeta` pm
             LEFT JOIN `{$prefix}posts` p ON p.ID = pm.post_id
             WHERE p.ID IS NULL"
        );
    }

    echo json_encode(['success' => true, 'dry_run' => $dryRun, 'counts' => $counts]);
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

function connectPdo(array $db): PDO {
    $dsn = "mysql:host={$db['host']};port={$db['port']};dbname={$db['name']};charset=utf8mb4";
    return new PDO($dsn, $db['user'], $db['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 15,
    ]);
}
