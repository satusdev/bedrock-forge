# Production Environment Variables Template
# Placeholders like %%DB_NAME%% will be replaced by create-site.sh
# You will need to manually update the actual values after site creation.

# Docker specific (usually not applicable for production)
# APP_PORT=80

# Database Credentials (UPDATE THESE FOR PRODUCTION SERVER)
DB_NAME=%%DB_NAME%%_production # Example: site1_db_production
DB_USER=%%DB_USER%%_production # Example: site1_user_production
DB_PASSWORD=%%DB_PASSWORD%%    # Needs secure password
DB_HOST=%%DB_HOST%%            # Example: production-db.internal.host

# Bedrock specific (UPDATE THESE FOR PRODUCTION SERVER)
WP_ENV=production
WP_HOME=%%WP_HOME%%            # Example: https://www.%%SITE_NAME%%.com
WP_SITEURL=%%WP_SITEURL%%        # Example: https://www.%%SITE_NAME%%.com/wp

# Generate DIFFERENT salts for production using: https://roots.io/salts.html
# The create-site.sh script should prompt to generate these.
AUTH_KEY='generateme' # <<< GENERATE SALTS MANUALLY!
SECURE_AUTH_KEY='generateme' # <<< GENERATE SALTS MANUALLY!
LOGGED_IN_KEY='generateme' # <<< GENERATE SALTS MANUALLY!
NONCE_KEY='generateme' # <<< GENERATE SALTS MANUALLY!
AUTH_SALT='generateme' # <<< GENERATE SALTS MANUALLY!
SECURE_AUTH_SALT='generateme' # <<< GENERATE SALTS MANUALLY!
LOGGED_IN_SALT='generateme' # <<< GENERATE SALTS MANUALLY!
NONCE_SALT='generateme' # <<< GENERATE SALTS MANUALLY!
