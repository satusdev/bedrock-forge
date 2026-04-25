#!/usr/bin/env php
<?php
/**
 * custom-plugin-manager.php — Bedrock Forge custom GitHub plugin manager
 *
 * Manages installation and removal of custom GitHub-hosted plugins/themes via
 * the satusdev/monorepo-fetcher Composer plugin. Manipulates the site's
 * composer.json directly so that monorepo-fetcher can pull the correct files
 * on the next `composer install`.
 *
 * Usage:
 *   php custom-plugin-manager.php \
 *     --action=add \
 *     --docroot=/path/to/site \
 *     --slug=my-plugin \
 *     --repo-url=git@github.com:org/repo.git \
 *     --repo-path=. \
 *     --type=plugin \
 *     [--github-token=ghp_xxx]
 *
 *   php custom-plugin-manager.php \
 *     --action=remove \
 *     --docroot=/path/to/site \
 *     --slug=my-plugin \
 *     --repo-url=git@github.com:org/repo.git \
 *     --repo-path=.
 *
 * Outputs JSON on stdout:
 *   { "success": true, "output": "..." }
 *   { "success": false, "error": "..." }   (also writes to stderr, exit 1)
 *
 * Security:
 *   - slug validated against /^[a-z0-9_-]+$/
 *   - repo-url validated as a recognised git URL pattern
 *   - repo-path validated against /^[.a-z0-9\/_-]+$/
 *   - All shell arguments escaped via escapeshellarg()
 */

if (PHP_VERSION_ID < 70400) {
    fwrite(STDERR, "ERROR: PHP 7.4 or newer is required\n");
    exit(1);
}

$opts      = getopt('', ['action:', 'docroot:', 'slug:', 'repo-url:', 'repo-path::', 'type::', 'github-token::']);
$action    = $opts['action']        ?? null;
$docroot   = $opts['docroot']       ?? null;
$slug      = $opts['slug']          ?? null;
$repoUrl   = $opts['repo-url']      ?? null;
$repoPath  = $opts['repo-path']     ?? '.';
$type      = $opts['type']          ?? 'plugin';
$ghToken   = $opts['github-token']  ?? null;

// ─── Validation ───────────────────────────────────────────────────────────────

if (!in_array($action, ['add', 'remove'], true)) {
    bail("Invalid or missing --action. Valid values: add, remove");
}

if (!$docroot || !is_dir($docroot)) {
    bail("Invalid or missing --docroot: " . ($docroot ?? '(empty)'));
}

if (!$slug || !preg_match('/^[a-z0-9_-]+$/', $slug)) {
    bail("Invalid or missing --slug. Must match /^[a-z0-9_-]+$/");
}

if (!$repoUrl || !preg_match(
    '/^(git@[a-zA-Z0-9._-]+:[a-zA-Z0-9._\/-]+\.git|https?:\/\/[a-zA-Z0-9._\/-]+\.git|https?:\/\/github\.com\/[a-zA-Z0-9._\/-]+)$/',
    $repoUrl
)) {
    bail("Invalid or missing --repo-url. Must be a valid git URL.");
}

if (!preg_match('/^[.a-zA-Z0-9\/_-]+$/', $repoPath)) {
    bail("Invalid --repo-path. Must match /^[.a-zA-Z0-9\\/_-]+$/");
}

if (!in_array($type, ['plugin', 'theme'], true)) {
    bail("Invalid --type. Must be 'plugin' or 'theme'.");
}

// ─── Locate composer.json ─────────────────────────────────────────────────────

$composerJsonPath = locateComposerJson($docroot);
if (!$composerJsonPath) {
    bail("No composer.json found in {$docroot} or its parent directory.");
}

$composerDir = dirname($composerJsonPath);
if (!chdir($composerDir)) {
    bail("Cannot chdir to {$composerDir}");
}

// ─── Detect Bedrock and determine target dir ──────────────────────────────────

$content = file_get_contents($composerJsonPath);
$composer = @json_decode($content, true);
if (!is_array($composer)) {
    bail("Could not parse composer.json at {$composerJsonPath}");
}

$isBedrock = false;
$installerPaths = $composer['extra']['installer-paths'] ?? [];
foreach (array_keys($installerPaths) as $path) {
    if (strpos($path, 'web/app/') !== false) {
        $isBedrock = true;
        break;
    }
}

$targetDir = ($type === 'theme')
    ? ($isBedrock ? 'web/app/themes' : 'wp-content/themes')
    : ($isBedrock ? 'web/app/plugins' : 'wp-content/plugins');

// ─── Handle add ───────────────────────────────────────────────────────────────

if ($action === 'add') {
    // Ensure satusdev/monorepo-fetcher is in require
    if (!isset($composer['require']['satusdev/monorepo-fetcher'])) {
        $composer['require']['satusdev/monorepo-fetcher'] = 'dev-main';
    }

    // Ensure repositories entry for vcs source
    $repos = $composer['repositories'] ?? [];
    $hasRepo = false;
    foreach ($repos as $repo) {
        if (
            isset($repo['type'], $repo['url']) &&
            $repo['type'] === 'vcs' &&
            $repo['url'] === 'https://github.com/satusdev/monorepo-fetcher'
        ) {
            $hasRepo = true;
            break;
        }
    }
    if (!$hasRepo) {
        $repos[] = [
            'type' => 'vcs',
            'url'  => 'https://github.com/satusdev/monorepo-fetcher',
        ];
        $composer['repositories'] = $repos;
    }

    // minimum-stability: dev is required for dev-main
    if (!isset($composer['minimum-stability'])) {
        $composer['minimum-stability'] = 'dev';
    }
    if (!isset($composer['prefer-stable'])) {
        $composer['prefer-stable'] = true;
    }

    // Find or create the matching monorepo-source entry
    $sources = $composer['extra']['monorepo-sources'] ?? [];
    $found = false;

    foreach ($sources as &$source) {
        if (
            isset($source['url'], $source['path']) &&
            $source['url'] === $repoUrl &&
            $source['path'] === $repoPath
        ) {
            $require = $source['require'] ?? [];
            if (!in_array($slug, $require, true)) {
                $require[] = $slug;
            }
            $source['require'] = array_values($require);
            $found = true;
            break;
        }
    }
    unset($source);

    if (!$found) {
        $sources[] = [
            'type'    => $type,
            'url'     => $repoUrl,
            'path'    => $repoPath,
            'target'  => $targetDir,
            'require' => [$slug],
        ];
    }

    $composer['extra']['monorepo-sources'] = $sources;

    // Write github-token to auth.json if provided
    if ($ghToken) {
        $authPath = $composerDir . '/auth.json';
        $auth = [];
        if (file_exists($authPath)) {
            $auth = @json_decode(file_get_contents($authPath), true) ?: [];
        }
        $auth['github-oauth']['github.com'] = $ghToken;
        file_put_contents(
            $authPath,
            json_encode($auth, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n"
        );
    }

    writeComposer($composerJsonPath, $composer);
    runComposer('install --no-dev --no-interaction 2>&1');
}

// ─── Handle remove ────────────────────────────────────────────────────────────

if ($action === 'remove') {
    $sources = $composer['extra']['monorepo-sources'] ?? [];
    $modified = false;

    foreach ($sources as $i => &$source) {
        if (
            isset($source['url'], $source['path']) &&
            $source['url'] === $repoUrl &&
            $source['path'] === $repoPath
        ) {
            $require = $source['require'] ?? [];
            $filtered = array_values(array_filter($require, fn($s) => $s !== $slug));
            if (count($filtered) === 0) {
                unset($sources[$i]);
            } else {
                $source['require'] = $filtered;
            }
            $modified = true;
            break;
        }
    }
    unset($source);

    if (!$modified) {
        // Plugin not found in any source — treat as already removed, succeed silently
        echo json_encode(['success' => true, 'output' => 'Plugin was not registered in composer.json'], JSON_UNESCAPED_SLASHES);
        exit(0);
    }

    $sources = array_values($sources);

    if (empty($sources)) {
        unset($composer['extra']['monorepo-sources']);
    } else {
        $composer['extra']['monorepo-sources'] = $sources;
    }

    writeComposer($composerJsonPath, $composer);
    runComposer('install --no-dev --no-interaction 2>&1');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function locateComposerJson(string $docroot): ?string
{
    foreach ([
        $docroot . '/composer.json',
        dirname($docroot) . '/composer.json',
    ] as $path) {
        if (file_exists($path)) {
            return $path;
        }
    }
    return null;
}

function writeComposer(string $path, array $data): void
{
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        bail('Failed to encode composer.json: ' . json_last_error_msg());
    }
    file_put_contents($path, $json . "\n");
}

function runComposer(string $args): void
{
    // Verify composer is available
    exec('composer --version 2>&1', $verOut, $verCode);
    if ($verCode !== 0) {
        bail('composer binary not found in $PATH');
    }

    $cmd         = 'composer ' . $args;
    $outputLines = [];
    $exitCode    = 0;
    exec($cmd, $outputLines, $exitCode);
    $output = implode("\n", $outputLines);

    if ($exitCode !== 0) {
        fwrite(STDERR, "ERROR: composer failed (exit {$exitCode}):\n{$output}\n");
        echo json_encode(['success' => false, 'error' => "composer failed (exit {$exitCode}): {$output}"], JSON_UNESCAPED_SLASHES);
        exit($exitCode);
    }

    echo json_encode(['success' => true, 'output' => $output], JSON_UNESCAPED_SLASHES);
}

function bail(string $msg): void
{
    fwrite(STDERR, "ERROR: {$msg}\n");
    echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_SLASHES);
    exit(1);
}
