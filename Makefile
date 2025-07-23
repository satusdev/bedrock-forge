# Makefile for Multi-Site WordPress Docker/Bedrock Environment

# Default values
SITE ?= site1
ENV ?= development
MYSQL_ROOT_PASSWORD ?= $(shell grep '^MYSQL_ROOT_PASSWORD=' core/.env 2>/dev/null | cut -d '=' -f2 || echo 'root')
DEBUG ?= no

# Optional debug statements
ifeq ($(DEBUG),yes)
  define debug_create_site
	@echo "DEBUG: Makefile - Entering create-site target"
	@echo "DEBUG: Makefile - site=$(site)"
	@echo "DEBUG: Makefile - Command to run: ./create-site.sh $(site) $(if $(port),--port=$(port)) $(if $(db-name),--db-name=$(db-name)) $(if $(db-user),--db-user=$(db-user)) $(if $(db-pass),--db-pass=$(db-pass)) $(if $(wp-home),--wp-home=$(wp-home)) $(if $(wp-siteurl),--wp-siteurl=$(wp-siteurl)) $(if $(server-name),--server-name=$(server-name)) $(if $(wp-admin-user),--wp-admin-user=$(wp-admin-user)) $(if $(wp-admin-pass),--wp-admin-pass=$(wp-admin-pass)) $(if $(wp-admin-email),--wp-admin-email=$(wp-admin-email)) $(if $(wp-title),--wp-title=$(wp-title)) $(if $(filter yes,$(create-db)),--create-db) $(if $(filter yes,$(install-wp)),--install-wp) $(if $(filter yes,$(run-composer)),--run-composer) $(if $(filter yes,$(switch-dev)),--switch-dev))"
  endef
else
  define debug_create_site
	# Debug disabled
  endef
endif

# Site-specific variables
SITE_DIR := websites/$(SITE)
SITE_COMPOSE_FILE := $(SITE_DIR)/docker-compose.yml

# Core DB compose file
CORE_DB_COMPOSE_FILE = core/docker-compose-db.yml

# Ensure core DB compose file exists
define check_core_db
	@if [ ! -f "$(CORE_DB_COMPOSE_FILE)" ]; then \
		echo "Error: Core DB compose file '$(CORE_DB_COMPOSE_FILE)' not found."; \
		exit 1; \
	fi
endef

.PHONY: help start-db stop-db create-site start stop restart logs shell composer wp switch-env sync-pull sync-push clean-dumps check_site_dir check_core_db

# Check site directory and compose file
check_site_dir:
	@if [ ! -d "$(SITE_DIR)" ]; then \
		echo "Error: Site directory '$(SITE_DIR)' does not exist. Run 'make create-site site=$(SITE)' first."; \
		exit 1; \
	fi
	@if [ ! -f "$(SITE_COMPOSE_FILE)" ]; then \
		echo "Error: Docker compose file '$(SITE_COMPOSE_FILE)' not found."; \
		exit 1; \
	fi

# Check core DB
check_core_db:
	$(check_core_db)

help:
	@echo "Makefile for Multi-Site WordPress Docker/Bedrock Environment"
	@echo ""
	@echo "Usage: make <target> [SITE=<site_name>] [ENV=<environment>] [VAR=value...]"
	@echo ""
	@echo "Core Targets:"
	@echo "  start-db           Start the shared database container"
	@echo "  stop-db            Stop the shared database container"
	@echo ""
	@echo "Site Creation:"
	@echo "  create-site        Create a new site. Requires site=<name>"
	@echo "                     Optional: port=<port> db-name=<name> db-user=<user> db-pass=<pass>"
	@echo "                     wp-home=<url> wp-siteurl=<url> server-name=<name>"
	@echo "                     wp-admin-user=<user> wp-admin-pass=<pass> wp-admin-email=<email> wp-title=<title>"
	@echo "                     Flags: create-db=yes install-wp=yes run-composer=yes switch-dev=yes"
	@echo "                     Example: make create-site site=site2 port=8002 create-db=yes"
	@echo ""
	@echo "Site Management (SITE=site1):"
	@echo "  start              Start containers for the site"
	@echo "  stop               Stop containers for the site"
	@echo "  restart            Restart containers for the site"
	@echo "  logs               Follow logs for the site's app container"
	@echo "  shell              Open a shell in the site's app container"
	@echo "  composer           Run composer command. Requires cmd=\"...\""
	@echo "                     Example: make composer cmd=\"update\""
	@echo "  wp                 Run WP-CLI command. Requires cmd=\"...\""
	@echo "                     Example: make wp cmd=\"plugin list\""
	@echo "  switch-env         Switch site's .env file. Requires ENV=<env>"
	@echo "                     Example: make switch-env ENV=staging"
	@echo ""
	@echo "Data Synchronization (SITE=site1, ENV=staging):"
	@echo "  sync-pull          Pull DB and uploads from remote"
	@echo "  sync-push          Push DB and uploads to remote (CAUTION!)"
	@echo ""
	@echo "Cleanup:"
	@echo "  clean-dumps        Remove *.sql files from scripts/db_sync/"

# Core DB Targets
start-db: check_core_db
	@echo "Starting shared database..."
	@MYSQL_ROOT_PASSWORD=$(MYSQL_ROOT_PASSWORD) docker-compose -f $(CORE_DB_COMPOSE_FILE) up -d

stop-db: check_core_db
	@echo "Stopping shared database..."
	@docker-compose -f $(CORE_DB_COMPOSE_FILE) down

# Site Creation
create-site:
ifndef site
	$(error site variable is required. Example: make create-site site=myblog)
endif
	$(debug_create_site)
	@echo "Creating site $(site)..."
	@MYSQL_ROOT_PASSWORD=$(MYSQL_ROOT_PASSWORD) DEBUG=$(DEBUG) ./create-site.sh $(site) \
		$(if $(port),--port=$(port)) \
		$(if $(db-name),--db-name=$(db-name)) \
		$(if $(db-user),--db-user=$(db-user)) \
		$(if $(db-pass),--db-pass=$(db-pass)) \
		$(if $(wp-home),--wp-home=$(wp-home)) \
		$(if $(wp-siteurl),--wp-siteurl=$(wp-siteurl)) \
		$(if $(server-name),--server-name=$(server-name)) \
		$(if $(wp-admin-user),--wp-admin-user=$(wp-admin-user)) \
		$(if $(wp-admin-pass),--wp-admin-pass=$(wp-admin-pass)) \
		$(if $(wp-admin-email),--wp-admin-email=$(wp-admin-email)) \
		$(if $(wp-title),--wp-title=$(wp-title)) \
		$(if $(filter yes,$(create-db)),--create-db) \
		$(if $(filter yes,$(install-wp)),--install-wp) \
		$(if $(filter yes,$(run-composer)),--run-composer) \
		$(if $(filter yes,$(switch-dev)),--switch-dev)
	@if [ "$(run-composer)" = "yes" ] || [ "$(install-wp)" = "yes" ]; then \
		echo "Starting containers for site $(site)..."; \
		SITE=$(site) $(MAKE) start; \
	fi

# Site Management
start: check_site_dir
	@echo "Starting containers for site $(SITE)..."
	@cd $(SITE_DIR) && docker-compose up -d

stop: check_site_dir
	@echo "Stopping containers for site $(SITE)..."
	@cd $(SITE_DIR) && docker-compose down --remove-orphans

restart: stop start

logs: check_site_dir
	@echo "Following logs for site $(SITE) app container..."
	@cd $(SITE_DIR) && docker-compose logs -f app

shell: check_site_dir
	@echo "Opening shell in site $(SITE) app container..."
	@if docker-compose -f $(SITE_COMPOSE_FILE) ps -q app >/dev/null 2>&1; then \
		docker-compose -f $(SITE_COMPOSE_FILE) exec app bash; \
	else \
		echo "Error: App container for $(SITE) is not running. Run 'make start' first."; \
		exit 1; \
	fi

composer: check_site_dir
ifndef cmd
	$(error cmd variable is required. Example: make composer cmd="update")
endif
	@echo "Running 'composer $(cmd)' for site $(SITE)..."
	@if docker-compose -f $(SITE_COMPOSE_FILE) ps -q app >/dev/null 2>&1; then \
		docker-compose -f $(SITE_COMPOSE_FILE) exec -T app composer $(cmd) --working-dir=/var/www/html; \
	else \
		echo "Error: App container for $(SITE) is not running. Run 'make start' first."; \
		exit 1; \
	fi

wp: check_site_dir
ifndef cmd
	$(error cmd variable is required. Example: make wp cmd="plugin list")
endif
	@echo "Running 'wp $(cmd)' for site $(SITE)..."
	@if docker-compose -f $(SITE_COMPOSE_FILE) ps -q app >/dev/null 2>&1; then \
		docker-compose -f $(SITE_COMPOSE_FILE) exec -T app wp $(cmd) --allow-root; \
	else \
		echo "Error: App container for $(SITE) is not running. Run 'make start' first."; \
		exit 1; \
	fi

switch-env: check_site_dir
ifndef ENV
	$(error ENV variable is required. Example: make switch-env ENV=staging)
endif
	@echo "Switching environment for site $(SITE) to $(ENV)..."
	@./switch-env.sh $(SITE) $(ENV)

# Data Sync
sync-pull: check_site_dir
ifndef ENV
	$(error ENV variable is required. Example: make sync-pull ENV=staging)
endif
	@echo "Pulling data for site $(SITE) from $(ENV)..."
	@./scripts/pull-data.sh $(SITE) $(ENV)

sync-push: check_site_dir
ifndef ENV
	$(error ENV variable is required. Example: make sync-push ENV=staging)
endif
	@echo "Pushing data for site $(SITE) to $(ENV)..."
	@./scripts/push-data.sh $(SITE) $(ENV)

# Cleanup
clean-dumps:
	@echo "Removing *.sql files from scripts/db_sync/..."
	@find scripts/db_sync -name '*.sql' -type f -delete 2>/dev/null || echo "Note: On Windows, manually delete *.sql files in scripts/db_sync/"
	@echo "Cleanup complete."