# Development Environment Variables Template
# Placeholders like %%DB_NAME%% will be replaced by create-site.sh

# Docker specific - Port mapping for this site's Nginx container
APP_PORT=%%APP_PORT%% # Example: 8001 for site1, 8002 for site2 etc.

# Database Credentials (unique per site, connecting to shared 'db' service)
DB_NAME=%%DB_NAME%%          # Example: site1_db
DB_USER=%%DB_USER%%          # Example: site1_user
DB_PASSWORD=%%DB_PASSWORD%%    # Example: site1_pass
DB_HOST=db                   # Connects to the shared db service named 'db'
DB_CONTAINER=%%DB_CONTAINER%%

# Root password for the shared DB service (used internally by Docker Compose, not Bedrock directly)
# This value in the site's .env doesn't override the one used by the core DB service.
# It's included here mainly for reference or if scripts need it.
DB_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD:-default_insecure_root_password}

# Bedrock specific
WP_ENV=development
WP_HOME=%%WP_HOME%%          # Example: http://localhost:%%APP_PORT%%
WP_SITEURL=%%WP_SITEURL%%      # Example: http://localhost:%%APP_PORT%%/wp

SITE_TITLE='%%SITE_TITLE%%'
ADMIN_USER='%%ADMIN_USER%%'
ADMIN_PASSWORD='%%ADMIN_PASSWORD%%'
ADMIN_EMAIL='%%ADMIN_EMAIL%%'
WP_ALLOW_ROOT='%%WP_ALLOW_ROOT%%'

# Generate unique salts for each site using: https://roots.io/salts.html
# The create-site.sh script should prompt to generate these.
# Generate unique salts
AUTH_KEY='generateme' # <<< GENERATE SALTS MANUALLY!
SECURE_AUTH_KEY='generateme' # <<< GENERATE SALTS MANUALLY!
LOGGED_IN_KEY='generateme' # <<< GENERATE SALTS MANUALLY!
NONCE_KEY='generateme' # <<< GENERATE SALTS MANUALLY!
AUTH_SALT='generateme' # <<< GENERATE SALTS MANUALLY!
SECURE_AUTH_SALT='generateme' # <<< GENERATE SALTS MANUALLY!
LOGGED_IN_SALT='generateme' # <<< GENERATE SALTS MANUALLY!
NONCE_SALT='generateme' # <<< GENERATE SALTS MANUALLY!
