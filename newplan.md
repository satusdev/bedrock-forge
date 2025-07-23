Full Implementation Plan Task 1: Set Up Local Development Environment Subtask
1.1: Initialize Bedrock-based WordPress Site

Sub-subtask 1.1.1: Run create-site.sh to set up the site locally Command:
./create-site.sh my-site Follow the script prompts to configure the site (e.g.,
port, database details). Sub-subtask 1.1.2: Configure the .env file with local
database credentials Command: nano websites/my-site/.env Edit the file to
include: text

Collapse

Wrap

Copy DB_NAME=my_site_db DB_USER=root DB_PASSWORD=your_password Save and exit
(Ctrl+O, Enter, Ctrl+X in nano). Subtask 1.2: Version Control with GitHub

Sub-subtask 1.2.1: Initialize a Git repository in the site directory Command: cd
websites/my-site && git init Sub-subtask 1.2.2: Create a remote repository on
GitHub Manual Step: Go to GitHub.com, create a new repository (e.g.,
my-site-repo), and copy the repository URL. Sub-subtask 1.2.3: Push the local
code to the GitHub repository Commands: text

Collapse

Wrap

Copy git add . git commit -m "Initial commit" git remote add origin
<github-repo-url> git push -u origin main Task 2: Provision Servers Subtask 2.1:
Set Up Staging Server

Sub-subtask 2.1.1: Use provision-cyberpanel-bedrock.sh to set up CyberPanel on
Hetzner for staging Command: ./provision-cyberpanel-bedrock.sh
staging.my-site.com Ensure you have Hetzner API token and SSH keys configured
beforehand. Sub-subtask 2.1.2: Configure DNS settings for the staging domain
Manual Step: Log in to your DNS provider (e.g., Cloudflare) and set an A record
for staging.my-site.com pointing to the Hetzner server’s IP. Subtask 2.2: Set Up
Production Server

Sub-subtask 2.2.1: Use provision-cyberpanel-bedrock.sh to set up CyberPanel on
Hetzner for production Command: ./provision-cyberpanel-bedrock.sh my-site.com
Sub-subtask 2.2.2: Configure DNS settings for the production domain Manual Step:
Set an A record for my-site.com pointing to the production server’s IP via your
DNS provider. Task 3: Deploy Code to Servers Subtask 3.1: Deploy to Staging

Sub-subtask 3.1.1: Use deploy_code.sh to pull code from GitHub and deploy to the
staging server Command: ./deploy_code.sh my-site staging Ensure SSH keys are set
up for GitHub access on the staging server. Sub-subtask 3.1.2: Verify the
deployment by checking the staging site Command: curl -I
http://staging.my-site.com Check for a 200 OK response. Subtask 3.2: Deploy to
Production

Sub-subtask 3.2.1: Use deploy_code.sh to pull code from GitHub and deploy to the
production server Command: ./deploy_code.sh my-site production Sub-subtask
3.2.2: Verify the deployment by checking the production site Command: curl -I
http://my-site.com Confirm a 200 OK response. Task 4: Set Up Backups with GUI
Subtask 4.1: Configure rclone for Google Drive

Sub-subtask 4.1.1: Install rclone on the production server Command: ssh
user@production-server "sudo apt-get install rclone -y" Sub-subtask 4.1.2:
Configure rclone with Google Drive credentials Command: ssh
user@production-server "rclone config" Follow prompts to create a Google Drive
remote named gdrive. Subtask 4.2: Set Up rclone Web GUI

Sub-subtask 4.2.1: Run rclone with web GUI on the production server Command: ssh
user@production-server "rclone rcd --rc-web-gui --rc-addr=localhost:5572 &"
Sub-subtask 4.2.2: Secure the GUI with custom credentials Command: ssh
user@production-server "rclone rcd --rc-web-gui --rc-addr=localhost:5572
--rc-user=myuser --rc-pass=mypass &" Access via http://production-server-ip:5572
with credentials. Subtask 4.3: Enhance Backup Scripts

Sub-subtask 4.3.1: Modify sync_uploads.sh to handle uploads sync Command: nano
scripts/sync_uploads.sh Update to include: rclone sync /path/to/uploads
gdrive:backups/my-site/uploads Sub-subtask 4.3.2: Modify sync_db.sh to handle
database dumps and upload Command: nano scripts/sync_db.sh Add: rclone copy
/path/to/dump.sql gdrive:backups/my-site/db Task 5: Automate with Jenkins
Subtask 5.1: Set Up Jenkins Server

Sub-subtask 5.1.1: Install Jenkins on a Hetzner instance Command: ssh
user@jenkins-server "wget -q -O - https://pkg.jenkins.io/debian/jenkins.io.key |
sudo apt-key add - && sudo sh -c 'echo deb http://pkg.jenkins.io/debian-stable
binary/ > /etc/apt/sources.list.d/jenkins.list' && sudo apt-get update && sudo
apt-get install jenkins -y" Sub-subtask 5.1.2: Configure Jenkins with necessary
plugins Manual Step: Access Jenkins at http://jenkins-server:8080, install Git
and SSH plugins via the dashboard. Subtask 5.2: Create Jenkins Pipelines

Sub-subtask 5.2.1: Define a pipeline for deploying code Manual Step: Create a
pipeline in Jenkins with script: ./deploy_code.sh my-site $ENV Sub-subtask
5.2.2: Define a pipeline for running backups Manual Step: Create a pipeline
with: ./sync_uploads.sh my-site push production && ./sync_db.sh my-site push
production Schedule it nightly via Jenkins. Task 6: Monitor with Kuma Subtask
6.1: Install Uptime Kuma

Sub-subtask 6.1.1: Set up Uptime Kuma on a Hetzner instance Command: ssh
user@kuma-server "docker run -d -p 3001:3001 louislam/uptime-kuma" Sub-subtask
6.1.2: Configure Kuma to monitor sites Manual Step: Access
http://kuma-server:3001, add monitors for staging.my-site.com and my-site.com.
Subtask 6.2: Integrate with Jenkins

Sub-subtask 6.2.1: Notify Kuma after deployments Add to Jenkins pipeline: curl
-X POST http://kuma-server:3001/api/push/<monitor-id> Task 7: Secure Sensitive
Data Subtask 7.1: Use Environment Variables

Sub-subtask 7.1.1: Store sensitive data in environment variables Command: export
DB_PASSWORD=your_password Sub-subtask 7.1.2: Update scripts to use variables
Edit scripts (e.g., nano scripts/sync_db.sh) to use ${DB_PASSWORD}. Subtask 7.2:
Restrict Access

Sub-subtask 7.2.1: Secure Google Drive folders Manual Step: Set folder
permissions in Google Drive. Sub-subtask 7.2.2: Secure Jenkins and Kuma Manual
Step: Enable authentication in Jenkins and Kuma dashboards. Task 8: Modularize
Scripts Subtask 8.1: Create Common Configuration

Sub-subtask 8.1.1: Centralize shared logic in common.sh Command: nano
scripts/common.sh Add shared functions (e.g., error_exit). Sub-subtask 8.1.2:
Update scripts to source common.sh Add source scripts/common.sh to each script.
Subtask 8.2: Split manage-site.sh

Sub-subtask 8.2.1: Create setup_new_site.sh Command: cp scripts/manage-site.sh
scripts/setup_new_site.sh Edit to keep only setup logic. Sub-subtask 8.2.2:
Create deploy_code.sh Command: cp scripts/manage-site.sh scripts/deploy_code.sh
Edit to keep deployment logic. Sub-subtask 8.2.3: Create sync_db.sh Command: cp
scripts/manage-site.sh scripts/sync_db.sh Edit to keep database sync logic.
Sub-subtask 8.2.4: Create sync_uploads.sh Command: cp scripts/manage-site.sh
scripts/sync_uploads.sh Edit to keep uploads sync logic. Task 9: Add Logging
Subtask 9.1: Implement Logging in Scripts

Sub-subtask 9.1.1: Add logging statements Edit scripts (e.g., nano
scripts/deploy_code.sh) to include: echo "$(date) - Deploy completed" >>
logs/manage-site.log Sub-subtask 9.1.2: Log errors Update error_exit to log
errors before exiting. Subtask 9.2: Centralize Logs

Sub-subtask 9.2.1: Create logs directory Command: mkdir -p logs Sub-subtask
9.2.2: Set up log rotation Command: sudo logrotate -f /etc/logrotate.conf Task
10: Testing Subtask 10.1: Test Each Script

Sub-subtask 10.1.1: Test setup_new_site.sh Command: ./setup_new_site.sh testsite
production admin admin@example.com securepass Sub-subtask 10.1.2: Test
deploy_code.sh Commands: ./deploy_code.sh testsite staging and ./deploy_code.sh
testsite production Sub-subtask 10.1.3: Test sync_db.sh and sync_uploads.sh
Commands: ./sync_db.sh testsite push production and ./sync_uploads.sh testsite
pull production Subtask 10.2: Test Jenkins Pipelines

Sub-subtask 10.2.1: Run deployment pipeline Manual Step: Trigger Jenkins job and
verify site updates. Sub-subtask 10.2.2: Run backup pipeline Manual Step:
Trigger backup job and check Google Drive. Subtask 10.3: Test Monitoring

Sub-subtask 10.3.1: Simulate downtime Command: ssh user@production-server
"systemctl stop nginx" Check Kuma alerts. Sub-subtask 10.3.2: Verify Jenkins
notifications Check Kuma logs after deployment.

ere’s a step-by-step migration plan, split into atomic tasks with a clear flow
and commit points:
