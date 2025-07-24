#!/bin/bash
# jenkins-connect.sh - Register/update a Jenkins pipeline for a project

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"

source "$COMMON_DIR/logging.sh"
source "$COMMON_DIR/utils.sh"

usage() {
  echo "Usage: $0 --jenkins-url=URL --user=USER --token=API_TOKEN --job=JOBNAME --jenkinsfile=Jenkinsfile"
  exit 1
}

parse_arguments() {
  for arg in "$@"; do
    case $arg in
      --jenkins-url=*) JENKINS_URL="${arg#*=}" ;;
      --user=*) JENKINS_USER="${arg#*=}" ;;
      --token=*) JENKINS_TOKEN="${arg#*=}" ;;
      --job=*) JOB_NAME="${arg#*=}" ;;
      --jenkinsfile=*) JENKINSFILE_PATH="${arg#*=}" ;;
    esac
  done
  if [ -z "$JENKINS_URL" ] || [ -z "$JENKINS_USER" ] || [ -z "$JENKINS_TOKEN" ] || [ -z "$JOB_NAME" ] || [ -z "$JENKINSFILE_PATH" ]; then
    log_error "Missing required arguments."
    usage
  fi
}

main() {
  parse_arguments "$@"
  [ -f "$JENKINSFILE_PATH" ] || error_exit "Jenkinsfile $JENKINSFILE_PATH not found."
  CRUMB=$(curl -s -u "$JENKINS_USER:$JENKINS_TOKEN" "$JENKINS_URL/crumbIssuer/api/xml?xpath=concat(//crumbRequestField,\":\",//crumb)")
  # Create job if not exists
  JOB_EXISTS=$(curl -s -u "$JENKINS_USER:$JENKINS_TOKEN" "$JENKINS_URL/job/$JOB_NAME/api/json" | jq -r '.name // empty')
  if [ -z "$JOB_EXISTS" ]; then
    log_info "Creating Jenkins job $JOB_NAME"
    # Use pipeline script from Jenkinsfile
    PIPELINE_SCRIPT=$(sed 's/"/\\"/g' "$JENKINSFILE_PATH" | awk '{printf "%s\\n", $0}')
    XML="<flow-definition plugin=\"workflow-job\"><definition class=\"org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition\" plugin=\"workflow-cps\"><script>$PIPELINE_SCRIPT</script><sandbox>true</sandbox></definition></flow-definition>"
    curl -s -u "$JENKINS_USER:$JENKINS_TOKEN" -H "$CRUMB" -H "Content-Type: application/xml" \
      -d "$XML" "$JENKINS_URL/createItem?name=$JOB_NAME"
    log_success "Jenkins job $JOB_NAME created"
  else
    log_info "Updating Jenkins job $JOB_NAME"
    PIPELINE_SCRIPT=$(sed 's/"/\\"/g' "$JENKINSFILE_PATH" | awk '{printf "%s\\n", $0}')
    XML="<flow-definition plugin=\"workflow-job\"><definition class=\"org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition\" plugin=\"workflow-cps\"><script>$PIPELINE_SCRIPT</script><sandbox>true</sandbox></definition></flow-definition>"
    curl -s -u "$JENKINS_USER:$JENKINS_TOKEN" -H "$CRUMB" -H "Content-Type: application/xml" \
      -X POST -d "$XML" "$JENKINS_URL/job/$JOB_NAME/config.xml"
    log_success "Jenkins job $JOB_NAME updated"
  fi
}

main "$@"
