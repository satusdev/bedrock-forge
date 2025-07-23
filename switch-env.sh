#!/bin/bash

# Switches the active .env file for a specific site in the websites/ directory.

# Available environments (must match .env.*.tpl file names in template)
ENVS=("development" "staging" "production")

# Function to display usage
usage() {
  echo "Usage: $0 <site_name> <environment>"
  echo "  site_name: The name of the directory in websites/ (e.g., site1)"
  echo "  environment: One of ${ENVS[*]}"
  exit 1
}

# Check arguments
if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Error: Missing arguments."
  usage
fi

SITE_NAME=$1
TARGET_ENV=$2
SITE_DIR="websites/$SITE_NAME"
ENV_TEMPLATE_FILE="${SITE_DIR}/.env.${TARGET_ENV}.tpl" # Template file name
ENV_FILE_TO_COPY="${SITE_DIR}/.env.${TARGET_ENV}" # Actual env file for the site
ACTIVE_ENV_FILE="${SITE_DIR}/.env" # The active .env file for the site

# Check if site directory exists
if [ ! -d "$SITE_DIR" ]; then
  echo "Error: Site directory '$SITE_DIR' not found."
  exit 1
fi

# Check if the target environment is valid
valid_env=false
for env in "${ENVS[@]}"; do
  if [ "$env" == "$TARGET_ENV" ]; then
    valid_env=true
    break
  fi
done

if [ "$valid_env" = false ]; then
  echo "Error: Invalid environment '$TARGET_ENV'."
  usage
fi

# Check if the specific environment file exists for the site
# Note: create-site.sh should have created this from the template
if [ ! -f "$ENV_FILE_TO_COPY" ]; then
  # Check if the template exists as a fallback (maybe create-site wasn't run?)
  if [ -f "$ENV_TEMPLATE_FILE" ]; then
     echo "Warning: Site environment file '$ENV_FILE_TO_COPY' not found."
     echo "Attempting to copy from template '$ENV_TEMPLATE_FILE' instead."
     echo "You should run ./create-site.sh $SITE_NAME to properly initialize the site."
     ENV_FILE_TO_COPY=$ENV_TEMPLATE_FILE
  else
     echo "Error: Neither site environment file '$ENV_FILE_TO_COPY' nor template '$ENV_TEMPLATE_FILE' found."
     exit 1
  fi
fi

# Copy the target environment file to the site's active .env
echo "Switching '$SITE_NAME' to '$TARGET_ENV' environment..."
cp "$ENV_FILE_TO_COPY" "$ACTIVE_ENV_FILE"

if [ $? -eq 0 ]; then
  echo "Successfully switched '$SITE_NAME' to '$TARGET_ENV'. '$ACTIVE_ENV_FILE' has been updated."
  echo "Remember to restart Docker containers if they are running for '$SITE_NAME':"
  echo "cd $SITE_DIR && docker-compose down && docker-compose up -d"
else
  echo "Error: Failed to copy '$ENV_FILE_TO_COPY' to '$ACTIVE_ENV_FILE'."
  exit 1
fi

exit 0
