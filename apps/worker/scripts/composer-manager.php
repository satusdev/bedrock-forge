#!/usr/bin/env php
<?php
/**
 * composer-manager.php — Bedrock Forge composer plugin manager
 *
 * Usage:
 *   php composer-manager.php --docroot=/path --action=read
 *   php composer-manager.php --docroot=/path --action=add    --package=wpackagist-plugin/slug [--version=^1.5]
 *   php composer-manager.php --docroot=/path --action=remove --package=wpackagist-plugin/slug
 *   php composer-manager.php --docroot=/path --action=update --package=wpackagist-plugin/slug
 *   php composer-manager.php --docroot=/path --action=update-all
 *   php composer-manager.php --docroot=/path --action=change-constraint --package=wpackagist-plugin/slug --constraint=^2.0
 *
 * Outputs JSON on stdout:
 *   read:             { "managed_plugins": [...], "is_bedrock": true, "raw_composer": {...} }
 *   mutating actions: { "success": true, "output": "..." }
 *
 * Security:
 *   - Package names are validated against the pattern vendor/name (alphanumeric + dash/underscore)
 *   - Only wpackagist-plugin/* packages are allowed for mutating actions
 *   - All shell arguments are escaped via escapeshellarg()
 *   - Constraint is validated to contain only safe version specifier characters
 */

if (PHP_VERSION_ID < 70100) {
    fwrite(STDERR, "ERROR: PHP 7.1 or newer is required\n");
    exit(1);
}

$opts       = getopt('', ['docroot:', 'action:', 'package:', 'version:', 'constraint:']);
$docroot    = $opts['docroot']     ?? null;
$action     = $opts['action']      ?? null;
$package    = $opts['package']     ?? null;
$version    = $opts['version']     ?? null;
$constraint = $opts['constraint']  ?? null;

// ─── Validation ───────────────────────────────────────────────────────────────

if (!$docroot || !is_dir($docroot)) {
    bail('Invalid or missing --docroot');
}

$validActions = ['read', 'add', 'remove', 'update', 'update-all', 'change-constraint'];
if (!$action || !in_array($action, $validActions, true)) {
    bail('Missing or invalid --action. Valid values: ' . implode(', ', $validActions));
}

if ($package !== null) {
    // Strict validation: only allow vendor/package pattern with safe characters
    if (!preg_match('/^[a-z0-9_-]+\/[a-z0-9_-]+$/', $package)) {
        bail("Invalid package name format: {$package}");
    }
    // Only wpackagist-plugin/* allowed for mutating actions
    if (in_array($action, ['add', 'remove', 'update', 'change-constraint'], true)
        && strpos($package, 'wpackagist-plugin/') !== 0
    ) {
        bail("Only wpackagist-plugin/* packages are allowed. Got: {$package}");
    }
}

if (in_array($action, ['add', 'remove', 'update', 'change-constraint'], true) && !$package) {
    bail("--package is required for action '{$action}'");
}

if ($action === 'change-constraint' && !$constraint) {
    bail("--constraint is required for action 'change-constraint'");
}

// Validate constraint string: only safe version specifier characters allowed
if ($constraint !== null) {
    if (!preg_match('/^[\w.^~*|@, ><=!\-]+$/', $constraint)) {
        bail("Invalid constraint format: {$constraint}");
    }
}

// ─── Read action ──────────────────────────────────────────────────────────────

if ($action === 'read') {
    $composerJson = locateComposerJson($docroot);
    if (!$composerJson) {
        echo json_encode(['managed_plugins' => [], 'is_bedrock' => false, 'raw_composer' => null]);
        exit(0);
    }

    $content = file_get_contents($composerJson);
    $data    = @json_decode($content, true) ?: [];
    $require = $data['require'] ?? [];
    $managed = [];

    foreach ($require as $pkg => $ver) {
        if (strpos($pkg, 'wpackagist-plugin/') === 0) {
            $slug      = substr($pkg, strlen('wpackagist-plugin/'));
            $managed[] = [
                'slug'       => $slug,
                'package'    => $pkg,
                'constraint' => $ver,
            ];
        }
    }

    echo json_encode(
        ['managed_plugins' => $managed, 'is_bedrock' => true, 'raw_composer' => $data],
        JSON_UNESCAPED_SLASHES
    );
    exit(0);
}

// ─── Mutating actions ─────────────────────────────────────────────────────────

$composerJson = locateComposerJson($docroot);
if (!$composerJson) {
    bail("No composer.json found under {$docroot}");
}

// Change into the directory that holds composer.json
$composerDir = dirname($composerJson);
if (!chdir($composerDir)) {
    bail("Cannot chdir to {$composerDir}");
}

// Verify composer is available
exec('composer --version 2>&1', $verOutput, $verCode);
if ($verCode !== 0) {
    bail('composer binary not found in $PATH');
}

if ($action === 'add') {
    $spec = $version
        ? escapeshellarg($package) . ':' . escapeshellarg($version)
        : escapeshellarg($package);
    runComposer("require {$spec} --no-interaction --no-dev -W");

} elseif ($action === 'remove') {
    runComposer('remove ' . escapeshellarg($package) . ' --no-interaction');

} elseif ($action === 'update') {
    runComposer('update ' . escapeshellarg($package) . ' --no-interaction --no-dev');

} elseif ($action === 'update-all') {
    runComposer('update --no-interaction --no-dev');

} elseif ($action === 'change-constraint') {
    // Read, modify the constraint for the package, write back, then composer update
    $content = file_get_contents($composerJson);
    $data    = @json_decode($content, true);
    if (!is_array($data)) {
        bail('Could not parse composer.json at ' . $composerJson);
    }
    if (!isset($data['require'][$package])) {
        bail("Package {$package} is not present in composer.json require section");
    }
    $data['require'][$package] = $constraint;
    $newContent = json_encode(
        $data,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
    file_put_contents($composerJson, $newContent . "\n");
    // Run composer update for the specific package to resolve and install the new constraint
    runComposer('update ' . escapeshellarg($package) . ' --no-interaction --no-dev');
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

function runComposer(string $args): void
{
    $cmd         = "composer {$args} 2>&1";
    $outputLines = [];
    $exitCode    = 0;

    exec($cmd, $outputLines, $exitCode);
    $output = implode("\n", $outputLines);

    if ($exitCode !== 0) {
        fwrite(STDERR, "composer failed (exit {$exitCode}):\n{$output}\n");
        exit($exitCode);
    }

    echo json_encode(
        ['success' => true, 'output' => $output],
        JSON_UNESCAPED_SLASHES
    );
}

function bail(string $msg): void
{
    fwrite(STDERR, "ERROR: {$msg}\n");
    exit(1);
}
