#!/usr/bin/env php
<?php
/**
 * plugin-scan.php — Bedrock Forge plugin scanner
 * Usage: php plugin-scan.php --docroot=/var/www/site
 *
 * Outputs JSON object:
 *   { "is_bedrock": bool, "plugins": PluginInfo[] }
 *
 * PluginInfo:
 *   slug, name, version, latest_version, update_available, author,
 *   plugin_uri, description, managed_by_composer, composer_constraint,
 *   managed_by_monorepo, monorepo_repo_url, is_mu_plugin
 */

// PHP 7.1+ required
if (PHP_VERSION_ID < 70100) {
    fwrite(STDERR, "ERROR: PHP 7.1 or newer is required (this server runs PHP " . PHP_VERSION . ")\n");
    exit(1);
}

$opts    = getopt('', ['docroot:']);
$docroot = $opts['docroot'] ?? null;

if (!$docroot || !is_dir($docroot)) {
    fwrite(STDERR, "ERROR: Invalid or missing --docroot\n");
    exit(1);
}

// ─── Detect Bedrock layout and build composer constraint map ─────────────────

$isBedrock         = false;
$composerConstraints = []; // slug => constraint

$composerJsonPath = null;
foreach ([
    $docroot . '/composer.json',
    dirname($docroot) . '/composer.json',
] as $candidate) {
    if (file_exists($candidate)) {
        $composerJsonPath = $candidate;
        break;
    }
}

if ($composerJsonPath !== null) {
    $composerData = @json_decode(file_get_contents($composerJsonPath), true);
    if (is_array($composerData)) {
        $isBedrock = true;
        foreach ($composerData['require'] ?? [] as $pkg => $constraint) {
            if (strpos($pkg, 'wpackagist-plugin/') === 0) {
                $slug = substr($pkg, strlen('wpackagist-plugin/'));
                $composerConstraints[$slug] = $constraint;
            }
        }
    }
}

// Build GitHub-source slug map from both legacy config keys.
$monorepoSlugs = []; // slug => repo_url
if ($composerJsonPath !== null) {
    $sourceGroups = [];
    foreach (['repo-fetcher-sources', 'monorepo-sources'] as $sourceKey) {
        if (isset($composerData['extra'][$sourceKey])) $sourceGroups = array_merge($sourceGroups, (array) $composerData['extra'][$sourceKey]);
    }
    foreach ($sourceGroups as $source) {
        $sourceUrl = $source['url'] ?? '';
        foreach ((array) ($source['require'] ?? []) as $repoSlug) {
            if (is_string($repoSlug) && $repoSlug !== '') {
                $monorepoSlugs[$repoSlug] = $sourceUrl;
            } elseif (is_array($repoSlug) && isset($repoSlug['as'])) {
                $monorepoSlugs[$repoSlug['as']] = $sourceUrl;
            }
        }
    }
}

// ─── Locate plugins directory ─────────────────────────────────────────────────

$pluginsDir = null;
foreach ([
    $docroot . '/wp-content/plugins',
    $docroot . '/web/app/plugins',     // Bedrock
    $docroot . '/app/plugins',
] as $candidate) {
    if (is_dir($candidate)) {
        $pluginsDir = $candidate;
        break;
    }
}

if (!$pluginsDir) {
    fwrite(STDERR, "ERROR: Could not locate plugins directory under {$docroot}\n");
    exit(1);
}

// ─── Query Database for Active Plugins ────────────────────────────────────────

// PHP 7.1 compatibility polyfills
if (!function_exists('str_starts_with')) {
    function str_starts_with($haystack, $needle) {
        return (string)$needle !== '' && strncmp($haystack, $needle, strlen($needle)) === 0;
    }
}
if (!function_exists('str_contains')) {
    function str_contains($haystack, $needle) {
        return $needle !== '' && strpos($haystack, $needle) !== false;
    }
}

$activeList = [];
$db = loadDb($docroot);
if ($db) {
    try {
        $pdo = connectPdo($db);
        
        // Query active_plugins
        $stmt = $pdo->prepare("SELECT option_value FROM `{$db['prefix']}options` WHERE option_name = 'active_plugins' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row && !empty($row['option_value'])) {
            $unserialized = @unserialize($row['option_value']);
            if (is_array($unserialized)) {
                foreach ($unserialized as $pluginFile) {
                    $activeList[$pluginFile] = true;
                }
            }
        }
        
        // Query active_sitewide_plugins from sitemeta if multisite
        $metaTable = $db['prefix'] . 'sitemeta';
        $tableCheck = $pdo->query("SHOW TABLES LIKE '{$metaTable}'");
        if ($tableCheck && $tableCheck->rowCount() > 0) {
            $stmt = $pdo->prepare("SELECT meta_value FROM `{$metaTable}` WHERE meta_key = 'active_sitewide_plugins' LIMIT 1");
            $stmt->execute();
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && !empty($row['meta_value'])) {
                $unserialized = @unserialize($row['meta_value']);
                if (is_array($unserialized)) {
                    foreach (array_keys($unserialized) as $pluginFile) {
                        $activeList[$pluginFile] = true;
                    }
                }
            }
        }
    } catch (Exception $e) {
        // Fail silently
    }
}

// ─── Scan plugins ─────────────────────────────────────────────────────────────

$plugins = [];

foreach (scandir($pluginsDir) as $entry) {
    if ($entry === '.' || $entry === '..') continue;
    $pluginPath = $pluginsDir . '/' . $entry;
    if (!is_dir($pluginPath)) continue;

    // Find the main plugin file (same name as directory, or first .php with Plugin Name header)
    $candidates = [
        $pluginPath . '/' . $entry . '.php',
    ];
    foreach (glob($pluginPath . '/*.php') ?: [] as $phpFile) {
        $candidates[] = $phpFile;
    }

    $headers = [];
    $mainFile = null;
    foreach ($candidates as $candidate) {
        if (!file_exists($candidate)) continue;
        $content = file_get_contents($candidate, false, null, 0, 8192); // read first 8KB
        if (strpos($content, 'Plugin Name') !== false) {
            $headers = parsePluginHeaders($content);
            $mainFile = $candidate;
            break;
        }
    }

    if (empty($headers['name'])) continue;

    $markerPath = $pluginPath . '/.bedrock-forge-source.json';
    $marker = is_file($markerPath) ? @json_decode(file_get_contents($markerPath), true) : null;
    if (is_array($marker) && isset($marker['repo_url'])) {
        $monorepoSlugs[$entry] = (string) $marker['repo_url'];
    }

    $slug            = $entry;
    $currentVersion  = $headers['version'] ?? '0.0.0';
    $latestVersion   = fetchLatestVersion($slug);
    $updateAvailable = $latestVersion !== null && version_compare($latestVersion, $currentVersion, '>');

    $relPath = null;
    if ($mainFile !== null) {
        $relPath = substr($mainFile, strlen($pluginsDir) + 1);
    }
    $isActive = false;
    if ($relPath !== null && isset($activeList[$relPath])) {
        $isActive = true;
    }

    $plugins[] = [
        'slug'                => $slug,
        'name'                => $headers['name'],
        'version'             => $currentVersion,
        'latest_version'      => $latestVersion,
        'update_available'    => $updateAvailable,
        'author'              => $headers['author'] ?? null,
        'plugin_uri'          => $headers['plugin_uri'] ?? null,
        'description'         => isset($headers['description']) ? substr($headers['description'], 0, 200) : null,
        'managed_by_composer' => array_key_exists($slug, $composerConstraints),
        'composer_constraint' => $composerConstraints[$slug] ?? null,
        'managed_by_monorepo' => array_key_exists($slug, $monorepoSlugs),
        'monorepo_repo_url'   => $monorepoSlugs[$slug] ?? null,
        'is_mu_plugin'        => false,
        'status'              => $isActive ? 'active' : 'inactive',
    ];
}

// ─── Locate mu-plugins directory ─────────────────────────────────────────────

$muPluginsDir = null;
foreach ([
    $docroot . '/wp-content/mu-plugins',
    $docroot . '/web/app/mu-plugins',     // Bedrock
    $docroot . '/app/mu-plugins',
] as $candidate) {
    if (is_dir($candidate)) {
        $muPluginsDir = $candidate;
        break;
    }
}

// ─── Scan mu-plugins ─────────────────────────────────────────────────────────

if ($muPluginsDir) {
    foreach (scandir($muPluginsDir) as $entry) {
        if ($entry === '.' || $entry === '..') continue;

        $muPath     = $muPluginsDir . '/' . $entry;
        $headerFile = null;
        $slug       = $entry;

        if (is_dir($muPath)) {
            // Directory-based mu-plugin: find the main PHP file
            $candidates = [$muPath . '/' . $entry . '.php'];
            foreach (glob($muPath . '/*.php') ?: [] as $phpFile) {
                $candidates[] = $phpFile;
            }
            foreach ($candidates as $candidate) {
                if (!file_exists($candidate)) continue;
                $content = file_get_contents($candidate, false, null, 0, 8192);
                if (strpos($content, 'Plugin Name') !== false) {
                    $headerFile = $candidate;
                    break;
                }
            }
        } elseif (is_file($muPath) && pathinfo($muPath, PATHINFO_EXTENSION) === 'php') {
            // Single-file mu-plugin
            $content = file_get_contents($muPath, false, null, 0, 8192);
            if (strpos($content, 'Plugin Name') !== false) {
                $headerFile = $muPath;
                $slug       = pathinfo($entry, PATHINFO_FILENAME);
            }
        }

        if (!$headerFile) continue;

        $content = file_get_contents($headerFile, false, null, 0, 8192);
        $headers = parsePluginHeaders($content);
        if (empty($headers['name'])) continue;

        $plugins[] = [
            'slug'                => $slug,
            'name'                => $headers['name'],
            'version'             => $headers['version'] ?? '0.0.0',
            'latest_version'      => null,
            'update_available'    => false,
            'author'              => $headers['author'] ?? null,
            'plugin_uri'          => $headers['plugin_uri'] ?? null,
            'description'         => isset($headers['description']) ? substr($headers['description'], 0, 200) : null,
            'managed_by_composer' => false,
            'composer_constraint' => null,
            'managed_by_monorepo' => false,
            'monorepo_repo_url'   => null,
            'is_mu_plugin'        => true,
            'status'              => 'active',
        ];
    }
}

echo json_encode(
    [
        'is_bedrock'   => $isBedrock,
        'plugins'      => $plugins,
        'php_settings' => [
            'php_version'        => PHP_VERSION,
            'memory_limit'       => ini_get('memory_limit'),
            'max_execution_time' => ini_get('max_execution_time'),
            'upload_max_filesize'=> ini_get('upload_max_filesize'),
            'post_max_size'      => ini_get('post_max_size'),
            'display_errors'     => ini_get('display_errors'),
        ],
    ],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);
exit(0);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parsePluginHeaders(string $content): array {
    $headers = [];
    $map = [
        'Plugin Name' => 'name',
        'Version'     => 'version',
        'Author'      => 'author',
        'Plugin URI'  => 'plugin_uri',
        'Description' => 'description',
    ];
    foreach ($map as $header => $key) {
        if (preg_match('/' . preg_quote($header, '/') . '\s*:\s*(.+)/i', $content, $m)) {
            $headers[$key] = trim($m[1]);
        }
    }
    return $headers;
}

function fetchLatestVersion(string $slug): ?string {
    $url     = "https://api.wordpress.org/plugins/info/1.0/{$slug}.json";
    $ctx     = stream_context_create(['http' => ['timeout' => 5, 'ignore_errors' => true]]);
    $result  = @file_get_contents($url, false, $ctx);
    if ($result === false) return null;
    $data = json_decode($result, true);
    return is_array($data) && isset($data['version']) ? $data['version'] : null;
}

function loadDb(string $docroot): ?array {
    // Bedrock-style .env
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
    // Legacy wp-config.php
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
        PDO::ATTR_TIMEOUT => 10,
    ]);
}
