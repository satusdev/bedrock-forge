# Backup: Bedrock WP-CLI Path & DB Dump Fix

**Date:** 2026-03-15  
**Status:** PASSED

## Task

Fix persistent backup failures for Bedrock WordPress sites. All DB dump
strategies fail because WP-CLI is invoked without `cd`-ing to the project root,
so `wp-cli.yml` (which contains `path: web/wp`) is never loaded and WP-CLI can't
locate WordPress core.

## Context

Bedrock layout for MG Staging:

- Project root: `/home/mg.staging.ly/public_html/` — contains `wp-cli.yml`,
  `.env`, `vendor/`
- WP core: `/home/mg.staging.ly/public_html/web/wp/`

`wp-cli.yml` contains `path: web/wp`. WP-CLI must be run from the project root
to pick this up. The scan path (`wp.service.ts::runWpScalarCommand`) already
does `cd "$ROOT" || exit 19` and works. The backup path omits the `cd`.

## Root Causes

1. **`createDatabaseDumpViaWpCli`** — no `cd` to `wpRoot`; `wp-cli.yml` is never
   read
2. **Remote-script WP-CLI fallback** — same issue (`wp --path="$WP_PATH"`
   without `cd` to project root)
3. **Remote-script quoting bug** — `"$(cat \\"$ERR_FILE\\")"` embeds literal
   `\"` chars into the cat path, causing
   `cat: '"/tmp/forge-err-xxx.txt"': No such file or directory`
4. **Candidate ordering** — for `/web` input, `web` is returned before `web/wp`;
   since WP core lives in `web/wp`, WP-CLI fails on the first attempt and wastes
   a round trip

## Plan

- `createDatabaseDumpViaWpCli`: Restructure commands to set ROOT/WP_PATH/WP_CMD
  variables, `cd $ROOT`, use vendor/bin/wp when present, then run export —
  matching `runWpScalarCommand` pattern
- Remote-script fallback loop: Add `case` to derive WP_ROOT from WP_PATH,
  `cd $WP_ROOT`, prefer vendor/bin/wp
- Remote-script printf: Replace `\\"$ERR_FILE\\"` with bare `$ERR_FILE`
- `deriveWordPressRuntimeCandidatesFromPathCandidates`: For `/web$` input,
  return `web/wp` candidate before `web` candidate
- Update spec for changed ordering

## Verification

- `pnpm --filter api test -- --testPathPattern=wordpress-paths`
- `pnpm --filter api test` (full suite)
