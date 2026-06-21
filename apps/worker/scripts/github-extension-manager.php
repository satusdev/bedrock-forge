#!/usr/bin/env php
<?php

if (PHP_VERSION_ID < 70400) {
    fwrite(STDERR, "ERROR: PHP 7.4 or newer is required\n");
    exit(1);
}

$opts = getopt('', ['action:', 'docroot:', 'slug:', 'repo-url:', 'repo-path::', 'type::', 'github-token::']);
$action = $opts['action'] ?? '';
$docroot = rtrim($opts['docroot'] ?? '', '/');
$slug = $opts['slug'] ?? '';
$repoUrl = $opts['repo-url'] ?? '';
$repoPath = trim($opts['repo-path'] ?? '.', '/');
$type = $opts['type'] ?? 'plugin';
$token = $opts['github-token'] ?? '';

if (!in_array($action, ['add', 'update', 'remove'], true)) bail('Invalid action');
if (!is_dir($docroot)) bail('Invalid docroot');
if (!preg_match('/^[a-z0-9_-]+$/', $slug)) bail('Invalid slug');
if (!in_array($type, ['plugin', 'theme'], true)) bail('Invalid type');
if (!preg_match('#^(?:git@github\.com:|https://github\.com/)[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$#', $repoUrl)) bail('Invalid GitHub repository URL');
if ($repoPath !== '.' && !preg_match('#^[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*$#', $repoPath)) bail('Invalid repository path');

$isBedrock = is_dir($docroot . '/web/app');
$base = $docroot . ($type === 'theme'
    ? ($isBedrock ? '/web/app/themes' : '/wp-content/themes')
    : ($isBedrock ? '/web/app/plugins' : '/wp-content/plugins'));
if (!is_dir($base) && !mkdir($base, 0755, true) && !is_dir($base)) bail('Cannot create target directory');

$target = $base . '/' . $slug;
$themeDir = $docroot . ($isBedrock ? '/web/app/themes' : '/wp-content/themes');
$themeExclusion = $type === 'theme' ? $slug : null;
$themesBefore = treeHash($themeDir, $themeExclusion);

if ($action === 'remove') {
    if (is_dir($target) || is_link($target)) removeTree($target);
    assertThemesUnchanged($themeDir, $themesBefore, $themeExclusion);
    success(['removed' => true]);
}

$work = $base . '/.forge-stage-' . $slug . '-' . bin2hex(random_bytes(6));
$checkout = $work . '/checkout';
$deploy = $work . '/deploy';
$backup = $base . '/.forge-backup-' . $slug . '-' . bin2hex(random_bytes(6));
$hadTarget = is_dir($target) || is_link($target);

try {
    mkdir($work, 0700, true);
    $httpsUrl = preg_replace('#^git@github\.com:#', 'https://github.com/', $repoUrl);
    if (substr($httpsUrl, -4) !== '.git') $httpsUrl .= '.git';
    $cloneUrl = $httpsUrl;
    if ($token !== '') $cloneUrl = preg_replace('#^https://#', 'https://x-access-token:' . rawurlencode($token) . '@', $httpsUrl);
    run('git clone --depth=1 --quiet ' . escapeshellarg($cloneUrl) . ' ' . escapeshellarg($checkout));
    $commit = trim(run('git -C ' . escapeshellarg($checkout) . ' rev-parse HEAD'));

    $source = $repoPath === '.' ? $checkout : $checkout . '/' . $repoPath;
    $realCheckout = realpath($checkout);
    $realSource = realpath($source);
    if ($realSource === false || $realCheckout === false || strpos($realSource, $realCheckout . DIRECTORY_SEPARATOR) !== 0 && $realSource !== $realCheckout) {
        throw new RuntimeException('Repository path was not found or escaped checkout');
    }
    validateExtension($realSource, $type);
    copyTree($realSource, $deploy, ['.git']);
    file_put_contents($deploy . '/.bedrock-forge-source.json', json_encode([
        'schema' => 1,
        'slug' => $slug,
        'type' => $type,
        'repo_url' => $repoUrl,
        'repo_path' => $repoPath,
        'commit' => $commit,
        'installed_at' => gmdate('c'),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");

    if ($hadTarget && !rename($target, $backup)) throw new RuntimeException('Could not stage existing extension for rollback');
    if (!rename($deploy, $target)) throw new RuntimeException('Could not atomically activate staged extension');
    validateExtension($target, $type);
    assertThemesUnchanged($themeDir, $themesBefore, $themeExclusion);
    restoreOwner($docroot, $target);
    if (is_dir($backup) || is_link($backup)) removeTree($backup);
    removeTree($work);
    success(['commit' => $commit, 'target' => $target]);
} catch (Throwable $e) {
    if ((is_dir($target) || is_link($target)) && $hadTarget && (is_dir($backup) || is_link($backup))) removeTree($target);
    if ($hadTarget && (is_dir($backup) || is_link($backup)) && !is_dir($target)) @rename($backup, $target);
    if (!$hadTarget && (is_dir($target) || is_link($target))) removeTree($target);
    if (is_dir($work)) removeTree($work);
    $message = $e->getMessage();
    if ($token !== '') $message = str_replace([$token, rawurlencode($token)], '***', $message);
    bail($message);
}

function validateExtension(string $path, string $type): void {
    if ($type === 'theme') {
        $style = $path . '/style.css';
        if (!is_file($style) || stripos((string) file_get_contents($style, false, null, 0, 8192), 'Theme Name:') === false) throw new RuntimeException('Theme header not found');
        return;
    }
    foreach (glob($path . '/*.php') ?: [] as $file) {
        if (stripos((string) file_get_contents($file, false, null, 0, 8192), 'Plugin Name:') !== false) return;
    }
    throw new RuntimeException('Plugin header not found');
}

function copyTree(string $src, string $dst, array $exclude = []): void {
    if (!mkdir($dst, 0755, true) && !is_dir($dst)) throw new RuntimeException('Cannot create deployment directory');
    foreach (scandir($src) ?: [] as $name) {
        if ($name === '.' || $name === '..' || in_array($name, $exclude, true)) continue;
        $from = $src . '/' . $name; $to = $dst . '/' . $name;
        if (is_link($from)) { if (!symlink(readlink($from), $to)) throw new RuntimeException('Cannot copy symlink'); }
        elseif (is_dir($from)) copyTree($from, $to, $exclude);
        elseif (!copy($from, $to)) throw new RuntimeException('Cannot copy file: ' . $name);
    }
}

function removeTree(string $path): void {
    if (is_link($path) || is_file($path)) { if (!@unlink($path)) throw new RuntimeException('Cannot remove path'); return; }
    if (!is_dir($path)) return;
    foreach (scandir($path) ?: [] as $name) if ($name !== '.' && $name !== '..') removeTree($path . '/' . $name);
    if (!@rmdir($path)) throw new RuntimeException('Cannot remove directory');
}

function treeHash(string $path, ?string $excludeTopLevel = null): string {
    if (!is_dir($path)) return hash('sha256', 'missing');
    $rows = [];
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
    foreach ($it as $file) {
        $rel = substr($file->getPathname(), strlen($path) + 1);
        if ($excludeTopLevel !== null && ($rel === $excludeTopLevel || strpos($rel, $excludeTopLevel . '/') === 0)) continue;
        $mode = sprintf('%o', $file->getPerms() & 0777);
        $rows[] = $mode . ':' . ($file->isLink() ? 'L:' . readlink($file->getPathname()) : ($file->isDir() ? 'D' : 'F:' . hash_file('sha256', $file->getPathname()))) . ':' . $rel;
    }
    sort($rows); return hash('sha256', implode("\n", $rows));
}

function assertThemesUnchanged(string $path, string $before, ?string $excludeTopLevel = null): void {
    if (treeHash($path, $excludeTopLevel) !== $before) throw new RuntimeException('Theme safety invariant failed; refusing extension operation');
}

function restoreOwner(string $docroot, string $target): void {
    $stat = @stat($docroot); if (!$stat) return;
    @chown($target, $stat['uid']); @chgrp($target, $stat['gid']);
    exec(sprintf('chown -R %d:%d %s', $stat['uid'], $stat['gid'], escapeshellarg($target)));
}

function run(string $cmd): string {
    exec($cmd . ' 2>&1', $out, $code);
    if ($code !== 0) throw new RuntimeException('Command failed: ' . implode("\n", $out));
    return implode("\n", $out);
}
function success(array $data): void { echo json_encode(['success' => true] + $data, JSON_UNESCAPED_SLASHES); exit(0); }
function bail(string $message): void { fwrite(STDERR, "ERROR: {$message}\n"); echo json_encode(['success' => false, 'error' => $message], JSON_UNESCAPED_SLASHES); exit(1); }
