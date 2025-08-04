# Production Environment Variables Template

APP_PORT=80

DB_NAME=prod_db
DB_USER=prod_user
DB_PASSWORD=prod_password
DB_HOST=db
DB_CONTAINER=prod_db

WP_ENV=production
WP_HOME=https://example.com
WP_SITEURL=https://example.com/wp

SITE_TITLE='Production Site'
ADMIN_USER='admin'
ADMIN_PASSWORD='securepassword'
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
