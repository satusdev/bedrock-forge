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

# Performance testing
PERFORMANCE_DB_PATH = "performance.db"
PERFORMANCE_REPORTS_DIR = "performance_reports"
PERFORMANCE_CONFIG_PATH = "forge/config/performance_presets.json"
DEFAULT_PERFORMANCE_PRESET = "business"

# Lighthouse configuration
LIGHTHOUSE_DEFAULT_CATEGORIES = ["performance", "accessibility", "best-practices", "seo"]
LIGHTHOUSE_DEFAULT_DEVICE = "desktop"
LIGHTHOUSE_DEFAULT_FORM_FACTOR = "desktop"
LIGHTHOUSE_DEFAULT_THROTTLING = True
LIGHTHOUSE_TIMEOUT = 300  # 5 minutes

# Performance thresholds
PERFORMANCE_EXCELLENT_THRESHOLD = 90
PERFORMANCE_GOOD_THRESHOLD = 70
PERFORMANCE_NEEDS_IMPROVEMENT_THRESHOLD = 50

# Core Web Vitals thresholds
CWV_LCP_EXCELLENT = 2500  # ms
CWV_LCP_GOOD = 4000  # ms
CWV_FID_EXCELLENT = 100  # ms
CWV_FID_GOOD = 300  # ms
CWV_CLS_EXCELLENT = 0.1
CWV_CLS_GOOD = 0.25
CWV_FCP_EXCELLENT = 1800  # ms
CWV_FCP_GOOD = 3000  # ms
CWV_TTFB_EXCELLENT = 600  # ms
CWV_TTFB_GOOD = 1000  # ms

# Performance budget defaults
DEFAULT_PERFORMANCE_SCORE_BUDGET = 80
DEFAULT_PAGE_SIZE_BUDGET = 2500000  # 2.5MB
DEFAULT_SCRIPT_SIZE_BUDGET = 500000  # 500KB
DEFAULT_STYLESHEET_SIZE_BUDGET = 200000  # 200KB
DEFAULT_IMAGE_SIZE_BUDGET = 1000000  # 1MB

# Performance monitoring
PERFORMANCE_MONITORING_INTERVAL = 3600  # 1 hour
PERFORMANCE_ALERT_COOLDOWN = 86400  # 24 hours
PERFORMANCE_TREND_ANALYSIS_DAYS = 30
PERFORMANCE_REGRESSION_THRESHOLD = 10  # 10% decline

# Performance report types
PERFORMANCE_REPORT_FORMATS = ["html", "json", "pdf"]
PERFORMANCE_DEFAULT_REPORT_FORMAT = "html"

# Database optimization
DB_OPTIMIZATION_DEFAULT_QUERIES = 100
DB_OPTIMIZATION_SLOW_QUERY_THRESHOLD = 1000  # ms
DB_OPTIMIZATION_INDEX_SUGGESTION_THRESHOLD = 10
DB_OPTIMIZATION_TABLE_SIZE_WARNING = 1000000000  # 1GB

# Caching strategies
CACHE_STRATEGIES = ["none", "basic", "aggressive", "custom"]
CACHE_DEFAULT_STRATEGY = "basic"
CACHE_BROWSER_TTL = 3600  # 1 hour
CACHE_PAGE_TTL = 86400  # 24 hours
CACHE_API_TTL = 300  # 5 minutes

# CDN providers
CDN_PROVIDERS = ["cloudflare", "aws_cloudfront", "fastly", "keycdn", "none"]
CDN_DEFAULT_PROVIDER = "cloudflare"
CDN_CACHE_TTL = 86400  # 24 hours

# Image optimization
IMAGE_FORMATS = ["jpeg", "png", "webp", "avif", "gif"]
IMAGE_DEFAULT_QUALITY = 85
IMAGE_MAX_WIDTH = 2560
IMAGE_MAX_HEIGHT = 1440
IMAGE_WEBP_QUALITY = 80
IMAGE_AVIF_QUALITY = 75
IMAGE_JPEG_QUALITY = 85
IMAGE_PNG_QUALITY = 90
IMAGE_GIF_QUALITY = 80

# Image optimization settings
IMAGE_COMPRESSION_LEVELS = ["low", "medium", "high", "ultra"]
IMAGE_DEFAULT_COMPRESSION = "medium"
IMAGE_PROGRESSIVE_JPEG = True
IMAGE_STRIP_METADATA = True
IMAGE_PRESERVE_ORIGINAL = True

# Image optimization thresholds
IMAGE_MAX_FILE_SIZE = 10485760  # 10MB
IMAGE_BATCH_SIZE = 50
IMAGE_LAZY_LOAD_THRESHOLD = 800  # pixels
IMAGE_OPTIMIZATION_TIMEOUT = 300  # 5 minutes

# Image format conversion
IMAGE_CREATE_WEBP = True
IMAGE_CREATE_AVIF = True
IMAGE_FALLBACK_FORMAT = "jpeg"
IMAGE_MODERN_FORMATS = ["webp", "avif"]
IMAGE_LEGACY_FORMATS = ["jpeg", "png", "gif"]

# Image optimization analysis
IMAGE_ANALYSIS_CACHE_TTL = 86400  # 24 hours
IMAGE_OPTIMIZATION_HISTORY_DAYS = 90
IMAGE_PERFORMANCE_GRADES = ["A", "B", "C", "D", "F"]

# Image optimization database
IMAGE_DB_PATH = "images.db"
IMAGE_CACHE_DIR = ".forge/cache/images"
IMAGE_CONFIG_PATH = ".forge/image_config.json"

# Image optimization commands
IMAGE_OPTIMIZE_COMMAND = "convert"
IMAGE_IDENTIFY_COMMAND = "identify"
IMAGE_PNGCRUSH_COMMAND = "pngcrush"

# Image optimization reports
IMAGE_REPORT_FORMATS = ["text", "json", "html"]
IMAGE_DEFAULT_REPORT_FORMAT = "text"

# Performance commands
PERFORMANCE_TEST_COMMAND = "npx lighthouse"
PERFORMANCE_TEST_OUTPUT_FORMAT = "json"
PERFORMANCE_TEST_CHROME_FLAGS = "--headless"
PERFORMANCE_TEST_SCREEN_EMULATION_MOBILE = "--screenEmulation.mobile"
PERFORMANCE_TEST_THROTTLING_METHOD = "provided"

# Performance API endpoints
PERFORMANCE_API_PREFIX = "/api/v1/performance"
PERFORMANCE_TEST_ENDPOINT = "/test"
PERFORMANCE_HISTORY_ENDPOINT = "/history"
PERFORMANCE_REPORT_ENDPOINT = "/report"
PERFORMANCE_BUDGET_ENDPOINT = "/budget"
PERFORMANCE_MONITOR_ENDPOINT = "/monitor"

# Analytics configuration
ANALYTICS_DB_PATH = "analytics.db"
ANALYTICS_EVENTS_DB_PATH = "events.db"
ANALYTICS_CONFIG_PATH = ".forge/analytics_config.json"
ANALYTICS_CACHE_DIR = ".forge/cache/analytics"
ANALYTICS_REPORTS_DIR = "analytics_reports"

# Google Analytics 4
GA4_API_BASE_URL = "https://analyticsdata.googleapis.com/v1beta"
GA4_AUTH_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"]
GA4_MAX_DIMENSIONS = 9
GA4_MAX_METRICS = 10
GA4_REPORT_TIMEOUT = 300

# WordPress Stats
WP_STATS_API_BASE_URL = "https://stats.wordpress.com"
WP_STATS_MAX_DAYS = 90
WP_STATS_RATE_LIMIT = 100  # requests per hour

# Analytics data collection
ANALYTICS_COLLECTION_INTERVAL = 3600  # 1 hour
ANALYTICS_DATA_RETENTION_DAYS = 365
ANALYTICS_CACHE_TTL = 3600  # 1 hour
ANALYTICS_BATCH_SIZE = 1000

# Traffic analysis
TRAFFIC_ANALYSIS_MIN_DAYS = 7
TRAFFIC_TREND_THRESHOLD = 10  # percentage
TRAFFIC_PATTERN_DAYS = 14
ENGAGEMENT_HIGH_THRESHOLD = 180  # seconds
ENGAGEMENT_LOW_THRESHOLD = 30  # seconds

# Content analysis
CONTENT_TOP_PAGES_LIMIT = 50
CONTENT_CATEGORIES = ["blog", "product", "service", "about", "contact", "landing", "other"]
CONTENT_HIGH_PERFORMANCE_THRESHOLD = 70
CONTENT_LOW_PERFORMANCE_THRESHOLD = 40
BOUNCE_RATE_HIGH_THRESHOLD = 70
BOUNCE_RATE_LOW_THRESHOLD = 30

# Real-time analytics
REAL_TIME_REFRESH_INTERVAL = 30  # seconds
REAL_TIME_ACTIVE_MINUTES = 30
REAL_TIME_ACTIVE_HOURS = 1

# Analytics reports
ANALYTICS_REPORT_FORMATS = ["html", "json", "pdf", "csv"]
ANALYTICS_DEFAULT_REPORT_FORMAT = "html"
ANALYTICS_REPORT_TEMPLATES_PATH = "forge/config/analytics_templates.json"

# Analytics API endpoints
ANALYTICS_API_PREFIX = "/api/v1/analytics"
ANALYTICS_COLLECT_ENDPOINT = "/collect"
ANALYTICS_TRAFFIC_ENDPOINT = "/traffic"
ANALYTICS_CONTENT_ENDPOINT = "/content"
ANALYTICS_REALTIME_ENDPOINT = "/realtime"
ANALYTICS_INSIGHTS_ENDPOINT = "/insights"