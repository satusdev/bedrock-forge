# Default Installed Plugins (Template) ⚙️

The `core/template/www/composer.json` file defines the default plugins and
themes that will be included when a new site is created using the
`create-site.sh` script.

### Core Functionality (`require`)

These plugins are included in all environments (development, staging,
production) by default.

- **Polylang (`wpackagist-plugin/polylang`)**: For multilingual sites.
- **Wordfence Security (`wpackagist-plugin/wordfence`)**: Security plugin.
- **W3 Total Cache (`wpackagist-plugin/w3-total-cache`)**: Caching plugin for
  performance.
- **WP All Import (`wpackagist-plugin/wp-all-import`)**: For importing data into
  WordPress.
- **ManageWP Worker (`wpackagist-plugin/worker`)**: Allows managing the site via
  ManageWP.
- **Contact Form 7 (`wpackagist-plugin/contact-form-7`)**: Simple contact form
  plugin.
- **Elementor (`wpackagist-plugin/elementor`)**: Page builder plugin.
- **Twenty Twenty-Four Theme (`wpackagist-theme/twentytwentyfour`)**: Default
  WordPress theme.

### Development Only (`require-dev`)

These plugins are only installed when running `composer install` without the
`--no-dev` flag, typically only in the local development environment.

- **Query Monitor (`wpackagist-plugin/query-monitor`)**: Developer tools panel
  for debugging database queries, hooks, etc.
- **Laravel Pint (`laravel/pint`)**: PHP code style fixer (used via Composer
  script, not a WP plugin).
- **Roave Security Advisories (`roave/security-advisories`)**: Ensures Composer
  doesn't install dependencies with known security vulnerabilities.

**Note:** To change these defaults for _future_ sites created with
`create-site.sh`, modify `core/template/www/composer.json` and then run
`composer update` within the `core/template/www/` directory _before_ creating
new sites. Existing sites will not be affected; manage their dependencies via
their own `composer.json` file (`websites/<site_name>/www/composer.json`).
