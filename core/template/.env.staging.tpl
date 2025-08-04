# Staging Environment Variables Template

APP_PORT=8080

DB_NAME=staging_db
DB_USER=staging_user
DB_PASSWORD=staging_password
DB_HOST=db
DB_CONTAINER=staging_db

WP_ENV=staging
WP_HOME=https://staging.example.com
WP_SITEURL=https://staging.example.com/wp

SITE_TITLE='Staging Site'
ADMIN_USER='admin'
ADMIN_PASSWORD='stagingpassword'
ADMIN_EMAIL='admin@example.com'
WP_ALLOW_ROOT='false'

AUTH_KEY='generateme'
SECURE_AUTH_KEY='generateme'
LOGGED_IN_KEY='generateme'
NONCE_KEY='generateme'
AUTH_SALT='generateme'
SECURE_AUTH_SALT='generateme'
LOGGED_IN_SALT='generateme'
NONCE_SALT='generateme'

# Host UID/GID for Docker user mapping (set dynamically by site-init)
HOST_UID=1000
HOST_GID=1000
