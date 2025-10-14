"""
Constants and default values for the Forge CLI.
"""

# Project defaults
DEFAULT_BASE_DIR = "~/Work/Wordpress/"
DEFAULT_PROJECT_NAME = "myproject"
DEFAULT_ADMIN_USER = "admin"
DEFAULT_ADMIN_EMAIL = "admin@example.com"
DEFAULT_SITE_TITLE_PLACEHOLDER = "{project_name}"
DEFAULT_DB_NAME = "db"
DEFAULT_DB_USER = "db"
DEFAULT_DB_PASSWORD = "db"
DEFAULT_DB_HOST = "db"

# File paths
DEFAULT_CONFIG_PATH = "forge/config/default.json"
DEFAULT_ENV_LOCAL_PATH = "forge/config/.env.local"
GLOBAL_CONFIG_PATH = "~/.forge/projects.json"

# DDEV configuration
DDEV_PROJECT_TYPE = "wordpress"
DDEV_DOCROOT = "web"
DDEV_AUTO_CONFIG = True

# WordPress environment
DEFAULT_WP_ENV = "development"
WP_SALT_LENGTH = 64
WP_SALT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_{}|~"

# WordPress salt keys
WP_SALT_KEYS = [
    "AUTH_KEY",
    "SECURE_AUTH_KEY",
    "LOGGED_IN_KEY",
    "NONCE_KEY",
    "AUTH_SALT",
    "SECURE_AUTH_SALT",
    "LOGGED_IN_SALT",
    "NONCE_SALT"
]

# Repository configuration
MONOREPO_FETCHER_URL = "https://github.com/satusdev/monorepo-fetcher"
MONOREPO_FETCHER_VERSION = "dev-main"
WPACKAGIST_URL = "https://wpackagist.org"

# GitHub defaults
DEFAULT_GITHUB_USER = "nadbad"
GITHUB_TOKEN_MAX_ATTEMPTS = 3
GITHUB_TOKEN_SCOPE = "repo"

# Timeouts and retries
COMPOSER_RETRY_ATTEMPTS = 3
COMPOSER_RETRY_DELAY = 5
FILE_WAIT_TIMEOUT = 60
FILE_WAIT_INTERVAL = 1
DDEV_INFO_WAIT_TIMEOUT = 30

# Default plugins
DEFAULT_PLUGIN_MANAGE_WP = "manage-wp"

# Plugin system
PLUGIN_PRESETS_CONFIG_PATH = "forge/config/plugin-presets.json"
DEFAULT_PLUGIN_PRESET = "business"
PLUGIN_CATEGORIES = ["essential", "seo", "performance", "security", "forms", "ecommerce", "media", "optimization"]
PLUGIN_TYPES = ["free", "freemium", "premium"]

# Plugin commands
PLUGIN_INSTALL_PATTERN = "ddev wp plugin install {plugin} --activate"
PLUGIN_UNINSTALL_PATTERN = "ddev wp plugin uninstall {plugin} --deactivate"
PLUGIN_LIST_PATTERN = "ddev wp plugin list --status=active"
PLUGIN_INFO_PATTERN = "ddev wp plugin info {plugin}"
PLUGIN_UPDATE_PATTERN = "ddev wp plugin update {plugin}"

# Plugin presets
PRESET_BLOG = "blog"
PRESET_BUSINESS = "business"
PRESET_ECOMMERCE = "ecommerce"
PRESET_PORTFOLIO = "portfolio"
PRESET_MINIMAL = "minimal"
PRESET_PERFORMANCE = "performance"

# Allowed paths for clean directory check
ALLOWED_PROJECT_PATHS = {
    "web",
    "web/.gitignore",
    "web/wp-config-ddev.php",
    "web/wp-config.php",
    ".ddev",
    ".ddev/config.yaml",
    ".forge",
    ".forge/project.json"
}

# Command patterns
DDEV_CONFIG_PATTERN = "ddev config --project-type={project_type} --docroot={docroot} --project-name={project_name} --auto"
COMPOSER_CREATE_PATTERN = "ddev composer create-project {package} {target}"
WP_INSTALL_PATTERN = "ddev wp core install --url={url} --title='{title}' --admin_user={admin_user} --admin_password={admin_password} --admin_email={admin_email} --skip-email"
PLUGIN_INSTALL_PATTERN = "ddev wp plugin install {plugin} --activate"

# Git commands
GIT_INIT = "git init"
GIT_ADD = "git add ."
GIT_COMMIT_INITIAL = "git commit -m 'Initial Bedrock project setup'"
GIT_REMOTE_ADD = "git remote add origin {url}"
GIT_PUSH_MAIN = "git push -u origin main"

# DDEV commands
DDEV_START = "ddev start"
DDEV_STOP = "ddev stop"
DDEV_STATUS = "ddev status"
DDEV_DELETE = "ddev delete -O"
DDEV_DESCRIBE_JSON = "ddev describe -j"

# WordPress commands
WP_CORE_VERSION = "ddev wp core version"
WP_OPTION_GET_SITEURL = "ddev wp option get siteurl"
WP_OPTION_GET_HOME = "ddev wp option get home"
WP_OPTION_GET_BLOGNAME = "ddev wp option get blogname"

# File permissions
DEFAULT_FILE_PERMISSIONS = "755"

# Environment variable names
ENV_GITHUB_TOKEN = "GITHUB_TOKEN"
ENV_WP_ENV = "WP_ENV"

# Validation patterns
VALID_DDEV_ACTIONS = ["start", "stop", "status"]
VALID_ENVIRONMENTS = ["development", "staging"]

# Progress messages
PROGRESS_DESC_SCANNING = "Scanning for sites"
PROGRESS_DESC_EXECUTING_SETUP = "Executing setup commands"
PROGRESS_DESC_FETCHING_DDEV_INFO = "Fetching DDEV info"
PROGRESS_DESC_FETCHING_WP_INFO = "Fetching WP info"
PROGRESS_DESC_INSTALLING_PLUGINS = "Installing default plugins"
PROGRESS_DESC_REMOVING_PROJECT = "Removing project"
PROGRESS_DESC_CLEANING_PATHS = "Cleaning invalid paths"

# Error messages
ERROR_DDEV_CONFIG_NOT_FOUND = "DDEV configuration not found in {project_dir}. Ensure 'ddev config' runs successfully."
ERROR_COMPOSER_JSON_NOT_FOUND = "composer.json did not appear after create-project. Aborting."
ERROR_WP_CORE_NOT_FOUND = "web/wp/wp-includes did not appear after create-project. Aborting."
ERROR_INDEX_PHP_NOT_FOUND = "web/index.php did not appear or is not readable after create-project. Aborting."
ERROR_PROJECT_NOT_FOUND = "No project info found for {project_name}"
ERROR_INVALID_PROJECT_SELECTION = "Invalid project selection"
ERROR_NO_PROJECTS_FOUND = "No projects found. Create a project first."
ERROR_INVALID_ACTION = "Invalid action: {action}. Choose from {valid_actions}"

# Success messages
SUCCESS_PROJECT_CREATED = "Project {project_name} created at {project_dir}. Access at: {url}"
SUCCESS_WP_ADMIN_INFO = "WordPress admin: {admin_url} (user: {admin_user}, password: {admin_password})"
SUCCESS_DDEV_COMMANDS = "DDEV commands: cd {project_dir} && ddev ssh, ddev stop, ddev status"
SUCCESS_GITHUB_REPO = "GitHub repository: {repo_url}"
SUCCESS_PROJECT_MANAGED = "Project {project_name} {action} completed."
SUCCESS_PROJECT_REMOVED = "Project {project_name} removed successfully."
SUCCESS_VSCODE_OPENED = "Opened project {project_name} in VS Code."
SUCCESS_PROJECT_SWITCHED = "Switched to project {project_name} with environment {env}."

# Warning messages
WARNING_VS_CODE_NOT_FOUND = "Warning: VS Code ('code' command) not found. Install it for open-vscode command: https://code.visualstudio.com/"
WARNING_FAILED_TO_FETCH_DDEV_INFO = "Failed to fetch DDEV info: {error}"
WARNING_FAILED_TO_FETCH_WP_INFO = "Failed to fetch WP info: {error}"
WARNING_FAILED_TO_INSTALL_PLUGIN = "Failed to install {plugin} plugin: {error}"
WARNING_REMOVED_NON_EMPTY_DIR = "Removed non-empty project directory: {project_dir}"
WARNING_CLEANED_INVALID_PATHS = "Cleaned invalid paths from {project_dir}: {paths}"
WARNING_COMPREHENSIVE_ATTEMPT_FAILED = "Composer attempt {attempt} failed: {error}. Retrying in {delay} seconds..."

# Directory structure requirements
WEB_WP_PATH = "web/wp"
WEB_WP_INCLUDES_PATH = "web/wp/wp-includes"
WEB_INDEX_PHP_PATH = "web/index.php"
ENV_FILE_PATH = ".env"
COMPOSER_JSON_PATH = "composer.json"
PROJECT_CONFIG_PATH = ".forge/project.json"