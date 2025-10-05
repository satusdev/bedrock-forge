import paramiko
import requests
import json
import xml.etree.ElementTree as ET
from ..utils.errors import ForgeError
from ..utils.logging import logger
from .ssl_certificates import run_ssh_command
from .cyberpanel import create_ssh_client
from .core import ServerProvider, ServerConfig, DeploymentResult, ServerType, DeploymentMethod, create_deployment_strategy
import os
import time
from pathlib import Path
from typing import Dict, Any, Optional

class LibyanSpiderCPanel:
    """LibyanSpider CPanel API client for server management."""

    def __init__(self, cpanel_url: str, username: str, password: str, verbose: bool = False):
        """
        Initialize LibyanSpider CPanel client.

        Args:
            cpanel_url: CPanel URL (e.g., https://server.example.com:2083)
            username: CPanel username
            password: CPanel password
            verbose: Enable verbose logging
        """
        self.cpanel_url = cpanel_url.rstrip('/')
        self.username = username
        self.password = password
        self.verbose = verbose
        self.session = requests.Session()
        self.session.verify = False  # For self-signed certificates

    def _make_api_request(self, module: str, function: str, params: dict = None) -> dict:
        """Make a CPanel API 2 request."""
        if params is None:
            params = {}

        api_url = f"{self.cpanel_url}/json-api/cpanel"
        api_params = {
            'cpanel_jsonapi_version': '2',
            'cpanel_jsonapi_module': module,
            'cpanel_jsonapi_func': function,
            'cpanel_jsonapi_user': self.username
        }
        api_params.update(params)

        try:
            if self.verbose:
                logger.info(f"Making CPanel API request: {module}::{function}")

            response = self.session.post(
                api_url,
                data=api_params,
                auth=(self.username, self.password),
                timeout=30
            )

            response.raise_for_status()
            data = response.json()

            if data.get('cpanelresult', {}).get('data'):
                return data['cpanelresult']['data']
            elif data.get('cpanelresult', {}).get('result') == 1:
                return data['cpanelresult']
            else:
                error_msg = data.get('cpanelresult', {}).get('reason', 'Unknown error')
                raise ForgeError(f"CPanel API error: {error_msg}")

        except requests.exceptions.RequestException as e:
            raise ForgeError(f"Failed to make CPanel API request: {str(e)}")

    def create_domain(self, domain: str, document_root: str = None, php_version: str = "8.1") -> bool:
        """Create a new domain in CPanel."""
        if self.verbose:
            logger.info(f"Creating domain {domain} in CPanel")

        try:
            params = {
                'domain': domain,
                'php_version': php_version
            }
            if document_root:
                params['rootdomain'] = document_root

            result = self._make_api_request('Domain', 'addsubdomain', params)

            if result and isinstance(result, list) and len(result) > 0:
                if self.verbose:
                    logger.info(f"Successfully created domain {domain}")
                return True
            else:
                raise ForgeError(f"Failed to create domain {domain}")

        except Exception as e:
            raise ForgeError(f"Failed to create domain {domain}: {str(e)}")

    def create_database(self, database_name: str, username: str = None, password: str = None) -> dict:
        """Create a MySQL database and user."""
        if self.verbose:
            logger.info(f"Creating database {database_name}")

        try:
            # Create database
            db_params = {'db': database_name}
            self._make_api_request('MysqlFE', 'createdb', db_params)

            # Create database user if provided
            if username and password:
                user_params = {'dbuser': username, 'password': password}
                self._make_api_request('MysqlFE', 'createdbuser', user_params)

                # Add user to database
                add_user_params = {
                    'db': database_name,
                    'dbuser': username,
                    'privileges': 'ALL PRIVILEGES'
                }
                self._make_api_request('MysqlFE', 'adduserdb', add_user_params)

            if self.verbose:
                logger.info(f"Successfully created database {database_name}")

            return {
                'database': database_name,
                'username': username,
                'host': 'localhost'
            }

        except Exception as e:
            raise ForgeError(f"Failed to create database {database_name}: {str(e)}")

    def create_email_account(self, email: str, password: str) -> bool:
        """Create an email account."""
        if self.verbose:
            logger.info(f"Creating email account {email}")

        try:
            # Parse email address
            parts = email.split('@')
            if len(parts) != 2:
                raise ForgeError("Invalid email address format")

            domain = parts[1]
            email_user = parts[0]

            params = {
                'domain': domain,
                'email': email_user,
                'password': password
            }

            result = self._make_api_request('Email', 'addpop', params)

            if result:
                if self.verbose:
                    logger.info(f"Successfully created email account {email}")
                return True
            else:
                raise ForgeError(f"Failed to create email account {email}")

        except Exception as e:
            raise ForgeError(f"Failed to create email account {email}: {str(e)}")

    def install_ssl_certificate(self, domain: str, certificate: str, private_key: str, cabundle: str = None) -> bool:
        """Install SSL certificate for a domain."""
        if self.verbose:
            logger.info(f"Installing SSL certificate for {domain}")

        try:
            params = {
                'domain': domain,
                'cert': certificate,
                'key': private_key
            }
            if cabundle:
                params['cabundle'] = cabundle

            result = self._make_api_request('SSL', 'installssl', params)

            if result:
                if self.verbose:
                    logger.info(f"Successfully installed SSL certificate for {domain}")
                return True
            else:
                raise ForgeError(f"Failed to install SSL certificate for {domain}")

        except Exception as e:
            raise ForgeError(f"Failed to install SSL certificate for {domain}: {str(e)}")

    def list_domains(self) -> list:
        """List all domains in CPanel."""
        try:
            result = self._make_api_request('Domain', 'listdomains')
            return result if result else []

        except Exception as e:
            raise ForgeError(f"Failed to list domains: {str(e)}")

    def list_databases(self) -> list:
        """List all databases in CPanel."""
        try:
            result = self._make_api_request('MysqlFE', 'listdbs')
            return result if result else []

        except Exception as e:
            raise ForgeError(f"Failed to list databases: {str(e)}")

    def get_disk_usage(self) -> dict:
        """Get disk usage information."""
        try:
            result = self._make_api_request('DiskInfo', 'diskusage')
            return result if result else {}

        except Exception as e:
            raise ForgeError(f"Failed to get disk usage: {str(e)}")

def setup_cpanel_wordpress(server_ip: str, ssh_user: str, ssh_key: str, domain: str, cpanel_username: str, cpanel_password: str, dry_run: bool = False, verbose: bool = False, ssh_port: int = 22) -> dict:
    """Set up WordPress on LibyanSpider CPanel server."""
    if verbose:
        logger.info(f"Setting up WordPress on LibyanSpider CPanel for {domain}")

    if dry_run:
        logger.info(f"Dry run: Would set up WordPress on CPanel for {domain}")
        return {"status": "dry-run"}

    client = None
    try:
        # Connect to server via SSH
        client = create_ssh_client(server_ip, ssh_user, ssh_key, ssh_port, verbose=verbose)

        # Get document root for domain
        cpanel_url = f"https://{server_ip}:2083"
        cpanel_client = LibyanSpiderCPanel(cpanel_url, cpanel_username, cpanel_password, verbose)

        # Create domain in CPanel
        cpanel_client.create_domain(domain)

        # Create database for WordPress
        db_name = f"wp_{domain.replace('.', '_')}_db"
        db_user = f"wp_{domain.replace('.', '_')}_user"
        db_password = f"wp_{domain.replace('.', '_')}_pass_{int(time.time())}"

        db_info = cpanel_client.create_database(db_name, db_user, db_password)

        # Create email account
        admin_email = f"admin@{domain}"
        email_password = f"email_{domain.replace('.', '_')}_pass_{int(time.time())}"
        cpanel_client.create_email_account(admin_email, email_password)

        # Get WordPress document root
        if domain.startswith('www.'):
            base_domain = domain[4:]
            doc_root = f"/home/{cpanel_username}/public_html/{base_domain}"
        else:
            doc_root = f"/home/{cpanel_username}/public_html/{domain}"

        # Create document root if it doesn't exist
        run_ssh_command(client, f"mkdir -p {doc_root}", dry_run, verbose)
        run_ssh_command(client, f"chown {cpanel_username}:{cpanel_username} {doc_root}", dry_run, verbose)

        return {
            "status": "success",
            "domain": domain,
            "document_root": doc_root,
            "database": db_info,
            "admin_email": admin_email,
            "cpanel_url": cpanel_url
        }

    except Exception as e:
        raise ForgeError(f"Failed to set up CPanel WordPress for {domain}: {str(e)}")
    finally:
        if client:
            client.close()

def deploy_to_cpanel(project_name: str, server_ip: str, ssh_user: str, ssh_key: str, domain: str, cpanel_username: str, cpanel_password: str, dry_run: bool = False, verbose: bool = False, ssh_port: int = 22) -> dict:
    """Deploy Bedrock WordPress project to LibyanSpider CPanel."""
    if verbose:
        logger.info(f"Deploying {project_name} to CPanel for {domain}")

    if dry_run:
        logger.info(f"Dry run: Would deploy {project_name} to CPanel for {domain}")
        return {"status": "dry-run"}

    local_path = os.path.expanduser(f"~/Work/Wordpress/{project_name}")
    if not os.path.exists(local_path):
        raise ForgeError(f"Local project not found at {local_path}")

    client = None
    try:
        # Set up CPanel WordPress environment
        setup_info = setup_cpanel_wordpress(
            server_ip, ssh_user, ssh_key, domain,
            cpanel_username, cpanel_password, dry_run, verbose, ssh_port
        )

        if dry_run:
            return setup_info

        # Connect via SSH for file operations
        client = create_ssh_client(server_ip, ssh_user, ssh_key, ssh_port, verbose=verbose)
        doc_root = setup_info['document_root']

        # Copy files to CPanel document root
        # First, clear the document root (except for any existing files we need)
        run_ssh_command(client, f"rm -rf {doc_root}/*", dry_run, verbose)

        # Copy WordPress files using rsync for efficiency
        rsync_cmd = f"rsync -avz -e 'ssh -i {os.path.expanduser(ssh_key)} -p {ssh_port}' {local_path}/ {ssh_user}@{server_ip}:{doc_root}/"
        run_ssh_command(client, f"echo 'Running rsync command on client side...'", dry_run, verbose)

        # The rsync command needs to be executed from the local machine
        import subprocess
        if not dry_run:
            result = subprocess.run(rsync_cmd, shell=True, capture_output=True, text=True)
            if result.returncode != 0:
                raise ForgeError(f"rsync failed: {result.stderr}")
            if verbose:
                logger.info(f"rsync output: {result.stdout}")

        # Set correct permissions
        run_ssh_command(client, f"chown -R {cpanel_username}:{cpanel_username} {doc_root}", dry_run, verbose)
        run_ssh_command(client, f"find {doc_root} -type d -exec chmod 755 {{}} \\;", dry_run, verbose)
        run_ssh_command(client, f"find {doc_root} -type f -exec chmod 644 {{}} \\;", dry_run, verbose)

        # Create wp-config.php from environment file
        env_file = os.path.join(local_path, '.env')
        if os.path.exists(env_file):
            from ..utils.config import load_config
            project_config = load_config(project_name, "production")

            wp_config_content = f"""<?php
/**
 * WordPress configuration for {domain}
 */

// Database settings
define('DB_NAME', '{setup_info["database"]["database"]}');
define('DB_USER', '{setup_info["database"]["username"]}');
define('DB_PASSWORD', '{setup_info["database"]["password"]}');
define('DB_HOST', '{setup_info["database"]["host"]}');
define('DB_CHARSET', 'utf8mb4');
define('DB_COLLATE', '');

// Authentication unique keys and salts
define('AUTH_KEY', '{getattr(project_config, "auth_key", "your-auth-key-here")}');
define('SECURE_AUTH_KEY', '{getattr(project_config, "secure_auth_key", "your-secure-auth-key-here")}');
define('LOGGED_IN_KEY', '{getattr(project_config, "logged_in_key", "your-logged-in-key-here")}');
define('NONCE_KEY', '{getattr(project_config, "nonce_key", "your-nonce-key-here")}');
define('AUTH_SALT', '{getattr(project_config, "auth_salt", "your-auth-salt-here")}');
define('SECURE_AUTH_SALT', '{getattr(project_config, "secure_auth_salt", "your-secure-auth-salt-here")}');
define('LOGGED_IN_SALT', '{getattr(project_config, "logged_in_salt", "your-logged-in-salt-here")}');
define('NONCE_SALT', '{getattr(project_config, "nonce_salt", "your-nonce-salt-here")}');

// WordPress environment
define('WP_HOME', 'https://{domain}');
define('WP_SITEURL', 'https://{domain}/wp');

// Content directory
define('CONTENT_DIR', '/app');

// Environment
define('WP_ENV', 'production');
define('WP_DEBUG', false);
define('WP_DEBUG_LOG', false);
define('WP_DEBUG_DISPLAY', false);

// Disable file edits
define('DISALLOW_FILE_EDIT', true);
define('DISALLOW_FILE_MODS', true);

// Security
define('FORCE_SSL_ADMIN', true);
define('AUTOMATIC_UPDATER_DISABLED', true);

// Bedrock specific
define('WP_ENVIRONMENT_TYPE', 'production');

$table_prefix = 'wp_';

/* That's all, stop editing! */

/** Absolute path to the WordPress directory. */
if ( ! defined('ABSPATH') ) {{
    define('ABSPATH', __DIR__ . '/wp/');
}}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-config.php';
"""

            wp_config_path = f"{doc_root}/wp-config.php"
            wp_config_cmd = f"cat > {wp_config_path} << 'EOF'\n{wp_config_content}\nEOF"
            run_ssh_command(client, wp_config_cmd, dry_run, verbose)
            run_ssh_command(client, f"chown {cpanel_username}:{cpanel_username} {wp_config_path}", dry_run, verbose)
            run_ssh_command(client, f"chmod 644 {wp_config_path}", dry_run, verbose)

        if verbose:
            logger.info(f"Successfully deployed {project_name} to CPanel for {domain}")

        return {
            **setup_info,
            "status": "success",
            "deployment_complete": True,
            "wp_admin_url": f"https://{domain}/wp/wp-admin/"
        }

    except Exception as e:
        raise ForgeError(f"Failed to deploy {project_name} to CPanel: {str(e)}")
    finally:
        if client:
            client.close()


class LibyanSpiderProvider(ServerProvider):
    """LibyanSpider provider implementation with CPanel and FTP support."""

    def __init__(self, config: ServerConfig, dry_run: bool = False, verbose: bool = False):
        super().__init__(config, dry_run, verbose)
        self.cpanel_client = None
        self.ftp_client = None

    def create_server(self) -> DeploymentResult:
        """LibyanSpider provider works with existing servers only."""
        return DeploymentResult(
            success=True,
            message="LibyanSpider provider works with existing CPanel/FTP servers only",
            details={
                "server_ip": self.config.ip_address,
                "domain": self.config.domain,
                "deployment_method": self.config.deployment_method.value
            }
        )

    def setup_environment(self) -> DeploymentResult:
        """Set up CPanel environment and create necessary resources."""
        try:
            if self.config.deployment_method in [DeploymentMethod.FTP, DeploymentMethod.SFTP]:
                return self._setup_ftp_environment()
            elif self.config.deployment_method == DeploymentMethod.SSH:
                return self._setup_cpanel_environment()
            else:
                return DeploymentResult(
                    success=False,
                    message="Unsupported deployment method for LibyanSpider",
                    error=f"Method {self.config.deployment_method.value} not supported"
                )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="Environment setup failed",
                error=str(e)
            )

    def deploy_application(self) -> DeploymentResult:
        """Deploy application using the configured method."""
        try:
            if self.config.deployment_method in [DeploymentMethod.FTP, DeploymentMethod.SFTP]:
                return self._deploy_via_ftp()
            elif self.config.deployment_method == DeploymentMethod.SSH:
                return self._deploy_via_cpanel()
            else:
                return DeploymentResult(
                    success=False,
                    message="Unsupported deployment method",
                    error=f"Method {self.config.deployment_method.value} not supported"
                )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="Application deployment failed",
                error=str(e)
            )

    def configure_ssl(self) -> DeploymentResult:
        """Configure SSL certificates via CPanel."""
        try:
            if self.config.deployment_method != DeploymentMethod.SSH:
                return DeploymentResult(
                    success=False,
                    message="SSL configuration requires SSH access to CPanel",
                    error="Use SSH deployment method for SSL configuration"
                )

            # Get CPanel credentials from additional config
            cpanel_username = self.config.additional_config.get('cpanel_username')
            cpanel_password = self.config.additional_config.get('cpanel_password')

            if not cpanel_username or not cpanel_password:
                return DeploymentResult(
                    success=False,
                    message="CPanel credentials not provided",
                    error="Provide cpanel_username and cpanel_password in additional_config"
                )

            # Set up CPanel client
            cpanel_url = f"https://{self.config.ip_address}:2083"
            self.cpanel_client = LibyanSpiderCPanel(cpanel_url, cpanel_username, cpanel_password, self.verbose)

            # For now, use Let's Encrypt via CPanel if available
            # In a real implementation, you'd use the CPanel SSL API
            return DeploymentResult(
                success=True,
                message="SSL configuration requires manual setup in CPanel",
                details={
                    "cpanel_url": cpanel_url,
                    "domain": self.config.domain,
                    "instructions": "Use CPanel > SSL/TLS > Install and Manage SSL to install certificates"
                }
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="SSL configuration failed",
                error=str(e)
            )

    def apply_security_hardening(self) -> DeploymentResult:
        """Apply security hardening (limited on shared hosting)."""
        try:
            # On shared hosting, security hardening is limited
            # We can only suggest best practices
            return DeploymentResult(
                success=True,
                message="Security hardening completed with limitations",
                details={
                    "limitations": [
                        "Shared hosting environment has limited security controls",
                        "Server-level security managed by hosting provider",
                        "Application-level security recommendations provided"
                    ],
                    "recommendations": [
                        "Use strong passwords",
                        "Keep WordPress and plugins updated",
                        "Use WordPress security plugins",
                        "Enable CPanel security features"
                    ]
                }
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="Security hardening failed",
                error=str(e)
            )

    def _setup_cpanel_environment(self) -> DeploymentResult:
        """Set up CPanel environment via SSH."""
        try:
            cpanel_username = self.config.additional_config.get('cpanel_username')
            cpanel_password = self.config.additional_config.get('cpanel_password')

            if not cpanel_username or not cpanel_password:
                return DeploymentResult(
                    success=False,
                    message="CPanel credentials not provided",
                    error="Provide cpanel_username and cpanel_password in additional_config"
                )

            # Set up CPanel WordPress environment
            setup_info = setup_cpanel_wordpress(
                self.config.ip_address,
                self.config.ssh_user,
                self.config.ssh_key,
                self.config.domain,
                cpanel_username,
                cpanel_password,
                self.dry_run,
                self.verbose
            )

            return DeploymentResult(
                success=True,
                message="CPanel environment setup completed",
                details=setup_info
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="CPanel environment setup failed",
                error=str(e)
            )

    def _setup_ftp_environment(self) -> DeploymentResult:
        """Set up FTP environment (basic setup)."""
        try:
            if not self.config.ftp_user or not self.config.ftp_password:
                return DeploymentResult(
                    success=False,
                    message="FTP credentials not provided",
                    error="Provide ftp_user and ftp_password in configuration"
                )

            # Test FTP connection
            deployment = create_deployment_strategy(self.config, self.dry_run, self.verbose)
            connection_test = deployment.test_connection()

            if not connection_test.success:
                return connection_test

            # Determine document root
            doc_root = self._determine_ftp_document_root()

            return DeploymentResult(
                success=True,
                message="FTP environment setup completed",
                details={
                    "document_root": doc_root,
                    "ftp_user": self.config.ftp_user,
                    "ftp_port": self.config.ftp_port
                }
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="FTP environment setup failed",
                error=str(e)
            )

    def _deploy_via_cpanel(self) -> DeploymentResult:
        """Deploy via CPanel using existing function."""
        try:
            cpanel_username = self.config.additional_config.get('cpanel_username')
            cpanel_password = self.config.additional_config.get('cpanel_password')

            deployment_info = deploy_to_cpanel(
                self.config.name,
                self.config.ip_address,
                self.config.ssh_user,
                self.config.ssh_key,
                self.config.domain,
                cpanel_username,
                cpanel_password,
                self.dry_run,
                self.verbose
            )

            return DeploymentResult(
                success=True,
                message="Application deployed via CPanel successfully",
                details=deployment_info
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="CPanel deployment failed",
                error=str(e)
            )

    def _deploy_via_ftp(self) -> DeploymentResult:
        """Deploy via FTP/SFTP."""
        try:
            local_project_path = Path(f"~/Work/Wordpress/{self.config.name}").expanduser()

            if not local_project_path.exists():
                return DeploymentResult(
                    success=False,
                    message="Local project not found",
                    error=f"Project directory not found: {local_project_path}"
                )

            # Create deployment strategy
            deployment = create_deployment_strategy(self.config, self.dry_run, self.verbose)

            if not deployment.connect():
                return DeploymentResult(
                    success=False,
                    message="Failed to connect via FTP/SFTP",
                    error="Connection failed"
                )

            try:
                # Determine remote path
                remote_path = self._determine_ftp_document_root()

                # Upload files
                upload_result = deployment.upload_files(local_project_path, remote_path)

                if not upload_result.success:
                    return upload_result

                return DeploymentResult(
                    success=True,
                    message="Application deployed via FTP/SFTP successfully",
                    details={
                        "remote_path": remote_path,
                        "files_uploaded": upload_result.details.get("files_uploaded", 0)
                    }
                )

            finally:
                deployment.disconnect()

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="FTP/SFTP deployment failed",
                error=str(e)
            )

    def _determine_ftp_document_root(self) -> str:
        """Determine FTP document root based on configuration."""
        # Check if document root is specified in additional config
        doc_root = self.config.additional_config.get('document_root')
        if doc_root:
            return doc_root

        # Default document roots for common hosting setups
        if self.config.domain.startswith('www.'):
            base_domain = self.config.domain[4:]
        else:
            base_domain = self.config.domain

        # Common document root patterns
        possible_roots = [
            f"/public_html/{base_domain}",
            f"/public_html/{self.config.domain}",
            f"/www/{base_domain}",
            f"/httpdocs/{base_domain}",
            f"/home/{self.config.ftp_user}/public_html/{base_domain}",
            f"/home/{self.config.ftp_user}/public_html/{self.config.domain}",
            "/public_html",
            "/www",
            "/httpdocs"
        ]

        # Return the most likely document root
        return possible_roots[0]

    def create_email_account(self, email: str, password: str) -> DeploymentResult:
        """Create email account via CPanel."""
        try:
            if not self.cpanel_client:
                cpanel_username = self.config.additional_config.get('cpanel_username')
                cpanel_password = self.config.additional_config.get('cpanel_password')

                if not cpanel_username or not cpanel_password:
                    return DeploymentResult(
                        success=False,
                        message="CPanel credentials not provided",
                        error="Provide cpanel_username and cpanel_password in additional_config"
                    )

                cpanel_url = f"https://{self.config.ip_address}:2083"
                self.cpanel_client = LibyanSpiderCPanel(cpanel_url, cpanel_username, cpanel_password, self.verbose)

            success = self.cpanel_client.create_email_account(email, password)

            return DeploymentResult(
                success=success,
                message=f"Email account {'created' if success else 'failed to create'}: {email}",
                details={"email": email}
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="Email account creation failed",
                error=str(e)
            )

    def create_database(self, database_name: str, username: str = None, password: str = None) -> DeploymentResult:
        """Create database via CPanel."""
        try:
            if not self.cpanel_client:
                cpanel_username = self.config.additional_config.get('cpanel_username')
                cpanel_password = self.config.additional_config.get('cpanel_password')

                if not cpanel_username or not cpanel_password:
                    return DeploymentResult(
                        success=False,
                        message="CPanel credentials not provided",
                        error="Provide cpanel_username and cpanel_password in additional_config"
                    )

                cpanel_url = f"https://{self.config.ip_address}:2083"
                self.cpanel_client = LibyanSpiderCPanel(cpanel_url, cpanel_username, cpanel_password, self.verbose)

            db_info = self.cpanel_client.create_database(database_name, username, password)

            return DeploymentResult(
                success=True,
                message="Database created successfully",
                details=db_info
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="Database creation failed",
                error=str(e)
            )