<?php
/**
 * Bedrock Forge — one-time WordPress quick-login link.
 *
 * This file is deployed by the bedrock-forge API to the site web root with a
 * unique filename. It validates the token, self-destructs immediately after
 * validation, then sets the WP auth cookie and redirects to wp-admin.
 *
 * IMPORTANT: All placeholder values ({TOKEN}, {EXPIRY_TS}, {USER_ID}) are
 * replaced at deploy time by the bedrock-forge environments service.
 * Do NOT alter the placeholder syntax — it is matched by str_replace() in PHP.
 */

declare(strict_types=1);

// ── Token validation ──────────────────────────────────────────────────────────

$token = (string)($_GET['t'] ?? '');

if (!hash_equals('{TOKEN}', $token)) {
    http_response_code(403);
    header('Content-Type: text/plain');
    exit('Forbidden');
}

if (time() > {EXPIRY_TS}) {
    @unlink(__FILE__);
    http_response_code(410);
    header('Content-Type: text/plain');
    exit('This link has expired');
}

// ── Self-destruct (single-use) ────────────────────────────────────────────────

@unlink(__FILE__);

// ── Bootstrap WordPress ───────────────────────────────────────────────────────

$wpLoadCandidates = [
    __DIR__ . '/wp-load.php',        // Standard WordPress
    __DIR__ . '/wp/wp-load.php',     // Bedrock (web/ subfolder)
];

$wpLoad = null;
foreach ($wpLoadCandidates as $candidate) {
    if (file_exists($candidate)) {
        $wpLoad = $candidate;
        break;
    }
}

if ($wpLoad === null) {
    http_response_code(500);
    header('Content-Type: text/plain');
    exit('WordPress installation not found');
}

/** @noinspection PhpIncludeInspection */
require_once $wpLoad;

// ── Log in and redirect ───────────────────────────────────────────────────────

$userId = (int){USER_ID};

if (!get_userdata($userId)) {
    http_response_code(404);
    exit('WordPress user not found');
}

wp_set_auth_cookie($userId, false);
wp_safe_redirect(admin_url());
exit;
