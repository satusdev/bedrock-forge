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
 *   plugin_uri, description, managed_by_composer, composer_constraint
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
    foreach ($candidates as $candidate) {
        if (!file_exists($candidate)) continue;
        $content = file_get_contents($candidate, false, null, 0, 8192); // read first 8KB
        if (strpos($content, 'Plugin Name') !== false) {
            $headers = parsePluginHeaders($content);
            break;
        }
    }

    if (empty($headers['name'])) continue;

    $slug            = $entry;
    $currentVersion  = $headers['version'] ?? '0.0.0';
    $latestVersion   = fetchLatestVersion($slug);
    $updateAvailable = $latestVersion !== null && version_compare($latestVersion, $currentVersion, '>');

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
        'is_mu_plugin'        => false,
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
            'is_mu_plugin'        => true,
        ];
    }
}

echo json_encode(
    ['is_bedrock' => $isBedrock, 'plugins' => $plugins],
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
