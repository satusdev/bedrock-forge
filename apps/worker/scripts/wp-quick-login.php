<?php
/**
 * Bedrock Forge — one-time WordPress quick-login link.
 *
 * This file is deployed by the bedrock-forge API to the site web root with a
 * unique filename. It validates the token, self-destructs immediately after
 * validation, then sets the WP auth cookie and redirects to wp-admin.
 *
 * IMPORTANT: The TOKEN, EXPIRY_TS, and USER_ID placeholders below are
 * replaced at deploy time by the bedrock-forge environments service.
 */

declare(strict_types=1);

// Buffer all output so that WP debug notices/warnings don't send headers early
// and cause wp_safe_redirect to fail with "headers already sent" -> 500.
ob_start();

// ── Token validation ──────────────────────────────────────────────────────────

$token = (string)($_GET['t'] ?? '');

if (!hash_equals('{TOKEN}', $token)) {
    ob_end_clean();
    http_response_code(403);
    header('Content-Type: text/plain');
    exit('Forbidden');
}

if (time() > {EXPIRY_TS}) {
    @unlink(__FILE__);
    ob_end_clean();
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
    ob_end_clean();
    http_response_code(500);
    header('Content-Type: text/plain');
    exit('WordPress installation not found');
}

/** @noinspection PhpIncludeInspection */
require_once $wpLoad;

// ── Log in and redirect ───────────────────────────────────────────────────────

$userId = (int){USER_ID};

if (!get_userdata($userId)) {
    ob_end_clean();
    http_response_code(404);
    header('Content-Type: text/plain');
    exit('WordPress user not found');
}

wp_set_auth_cookie($userId, false);

// Discard any buffered WP debug output — headers haven't been sent yet.
ob_end_clean();

wp_safe_redirect(admin_url());
exit;
