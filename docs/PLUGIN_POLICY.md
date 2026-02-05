# Plugin Policy & Drift Detection

This document describes the plugin policy model and drift checks.

## Overview

Plugin policy enforces allowlists, required plugins, blocked plugins, and pinned
versions. Policies can be set globally and overridden per project.

## Policy Levels

- **Global policy**: Default rules for all projects owned by a user.
- **Project policy**: Optional override that can inherit from or replace the
  global policy.

## Fields

- **Allowed plugins**: Optional allowlist. If set, anything not listed (and not
  required) is considered disallowed.
- **Required plugins**: Must be installed for a project to be compliant.
- **Blocked plugins**: Must not be installed.
- **Pinned versions**: Specific plugin versions to enforce (`slug=version`).

## Drift Detection

Drift checks compare the effective policy to the last WP scan for a selected
environment.

Drift categories:

- **Missing required**: Required plugins not installed.
- **Blocked installed**: Blocked plugins present.
- **Disallowed installed**: Plugins installed but not in allowlist/required.
- **Version mismatches**: Installed versions differ from pinned versions.

## Remediation

Remediation actions use the WP‑CLI runner to install required plugins,
deactivate blocked/disallowed plugins, or update pinned versions.

## Vendor Bundles

Vendor bundles are curated sets of required plugins and pinned versions that can
be applied to global or project policies.

Bundle definitions live in forge/config/vendor-plugin-bundles.json.

## API Endpoints

- `GET /plugin-policies/global`
- `PUT /plugin-policies/global`
- `GET /plugin-policies/projects/{project_id}`
- `PUT /plugin-policies/projects/{project_id}`
- `GET /plugin-policies/projects/{project_id}/effective`
- `GET /plugin-policies/project-servers/{project_server_id}/drift`
- `GET /plugin-policies/bundles`
- `POST /plugin-policies/global/bundles/{bundle_id}`
- `POST /plugin-policies/projects/{project_id}/bundles/{bundle_id}`

## UI Location

Project Detail → Plugins & Themes tab → Plugin Policy section.
