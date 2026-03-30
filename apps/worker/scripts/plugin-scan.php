#!/usr/bin/env php
<?php
/**
 * plugin-scan.php — Bedrock Forge plugin scanner
 * Usage: php plugin-scan.php --docroot=/var/www/site
 * Outputs JSON array of plugin info objects.
 */

// PHP 7.1+ required (nullable return types, null coalescing operator, scalar type hints)
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

// Support both standard WP and Bedrock layouts
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

$plugins = [];

foreach (scandir($pluginsDir) as $entry) {
    if ($entry === '.' || $entry === '..') continue;
    $pluginPath = $pluginsDir . '/' . $entry;
    if (!is_dir($pluginPath)) continue;

    // Find the main plugin file (same name as directory, or first .php with Plugin Name header)
    $mainFile = null;
    $candidates = [
        $pluginPath . '/' . $entry . '.php',
    ];
    // Also scan all .php files in the directory root
    foreach (glob($pluginPath . '/*.php') ?: [] as $phpFile) {
        $candidates[] = $phpFile;
    }

    $headers = [];
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

    $slug            = $entry;
    $currentVersion  = $headers['version'] ?? '0.0.0';
    $latestVersion   = fetchLatestVersion($slug);
    $updateAvailable = $latestVersion !== null && version_compare($latestVersion, $currentVersion, '>');

    $plugins[] = [
        'slug'             => $slug,
        'name'             => $headers['name'],
        'version'          => $currentVersion,
        'latest_version'   => $latestVersion,
        'update_available' => $updateAvailable,
        'author'           => $headers['author'] ?? null,
        'plugin_uri'       => $headers['plugin_uri'] ?? null,
        'description'      => isset($headers['description']) ? substr($headers['description'], 0, 200) : null,
    ];
}

echo json_encode($plugins, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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
