#!/bin/bash
# show-project-info.sh - Display all project metadata in a human-friendly format

PROJECT_INFO_FILE="project-info.json"

if [ ! -f "$PROJECT_INFO_FILE" ]; then
  echo "Error: $PROJECT_INFO_FILE not found. Provisioning required."
  exit 1
fi

echo "==== Project Info ===="
jq '.' "$PROJECT_INFO_FILE"
