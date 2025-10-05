"""
Generic SSH server provider implementation.

This module provides a generic SSH-based server provider that can work with
any SSH-accessible server, regardless of the hosting provider.
"""

import paramiko
import os
from pathlib import Path
from typing import Dict, Any, Optional

from .core import ServerProvider, ServerConfig, DeploymentResult, WebServer, run_ssh_command
from .ssl_certificates import provision_ssl_via_certbot, setup_ssl_auto_renewal, provision_hardening, verify_ssl_domain
from ..utils.errors import ForgeError
from ..utils.logging import logger


class GenericSSHProvider(ServerProvider):
    """Generic SSH-based server provider for any SSH-accessible server."""

    def __init__(self, config: ServerConfig, dry_run: bool = False, verbose: bool = False):
        super().__init__(config, dry_run, verbose)
        self.client = None

    def create_server(self) -> DeploymentResult:
        """Generic provider doesn't create servers - works with existing ones."""
        return DeploymentResult(
            success=True,
            message="Generic SSH provider works with existing servers only",
            details={
                "server_ip": self.config.ip_address,
                "domain": self.config.domain,
                "note": "Use provider-specific modules to create new servers"
            }
        )

    def setup_environment(self) -> DeploymentResult:
        """Set up the server environment based on configuration."""
        try:
            if not self._connect():
                return DeploymentResult(
                    success=False,
                    message="Failed to connect to server",
                    error="SSH connection failed"
                )

            self.logger.info("Setting up server environment...")

            # Update system packages
            if self.verbose:
                self.logger.info("Updating system packages...")

            run_ssh_command(self.client, "apt update && apt upgrade -y", self.dry_run, self.verbose)

            # Install basic utilities
            basic_packages = "curl wget git unzip software-properties-common"
            run_ssh_command(self.client, f"apt install -y {basic_packages}", self.dry_run, self.verbose)

            # Set up web server
            web_server_result = self._setup_web_server()
            if not web_server_result.success:
                return web_server_result

            # Set up database
            database_result = self._setup_database()
            if not database_result.success:
                return database_result

            # Set up PHP if needed
            if self.config.web_server in [WebServer.NGINX, WebServer.APACHE]:
                php_result = self._setup_php()
                if not php_result.success:
                    return php_result

            # Set up WordPress
            wordpress_result = self._setup_wordpress()
            if not wordpress_result.success:
                return wordpress_result

            self._disconnect()

            return DeploymentResult(
                success=True,
                message="Server environment setup completed successfully",
                details={
                    "web_server": self.config.web_server.value,
                    "domain": self.config.domain,
                    "server_ip": self.config.ip_address
                }
            )

        except Exception as e:
            self._disconnect()
            return DeploymentResult(
                success=False,
                message="Server environment setup failed",
                error=str(e)
            )

    def deploy_application(self) -> DeploymentResult:
        """Deploy WordPress application."""
        try:
            if not self._connect():
                return DeploymentResult(
                    success=False,
                    message="Failed to connect to server",
                    error="SSH connection failed"
                )

            self.logger.info("Deploying WordPress application...")

            # Determine web root based on web server
            if self.config.web_server == WebServer.NGINX:
                web_root = f"/var/www/{self.config.domain}"
            elif self.config.web_server == WebServer.APACHE:
                web_root = f"/var/www/html/{self.config.domain}"
            else:
                web_root = f"/home/{self.config.domain}/public_html"

            # Create web root directory
            run_ssh_command(self.client, f"mkdir -p {web_root}", self.dry_run, self.verbose)
            run_ssh_command(self.client, f"chown -R www-data:www-data {web_root}", self.dry_run, self.verbose)

            # If local files exist, upload them
            local_project_path = Path(f"~/Work/Wordpress/{self.config.name}").expanduser()
            if local_project_path.exists():
                from .deployment_strategies import create_deployment_strategy
                deployment = create_deployment_strategy(self.config, self.dry_run, self.verbose)

                if deployment.connect():
                    upload_result = deployment.upload_files(local_project_path, web_root)
                    deployment.disconnect()

                    if not upload_result.success:
                        return upload_result

            # Set proper permissions
            run_ssh_command(self.client, f"find {web_root} -type d -exec chmod 755 {{}} \\;", self.dry_run, self.verbose)
            run_ssh_command(self.client, f"find {web_root} -type f -exec chmod 644 {{}} \\;", self.dry_run, self.verbose)

            self._disconnect()

            return DeploymentResult(
                success=True,
                message="WordPress application deployed successfully",
                details={
                    "web_root": web_root,
                    "domain": self.config.domain
                }
            )

        except Exception as e:
            self._disconnect()
            return DeploymentResult(
                success=False,
                message="Application deployment failed",
                error=str(e)
            )

    def configure_ssl(self) -> DeploymentResult:
        """Configure SSL certificates."""
        try:
            if not self._connect():
                return DeploymentResult(
                    success=False,
                    message="Failed to connect to server",
                    error="SSH connection failed"
                )

            self.logger.info("Configuring SSL certificates...")

            # Verify domain points to server
            if not verify_ssl_domain(self.client, self.config.domain, self.dry_run, self.verbose):
                self._disconnect()
                return DeploymentResult(
                    success=False,
                    message="Domain verification failed",
                    error=f"Domain {self.config.domain} does not point to server IP {self.config.ip_address}"
                )

            # Provision SSL certificate
            if not provision_ssl_via_certbot(self.client, self.config.domain, f"admin@{self.config.domain}", self.dry_run, self.verbose):
                self._disconnect()
                return DeploymentResult(
                    success=False,
                    message="SSL certificate provisioning failed",
                    error="Certbot failed to issue certificate"
                )

            # Set up auto-renewal
            if not setup_ssl_auto_renewal(self.client, self.config.domain, self.dry_run, self.verbose):
                self.logger.warning("SSL auto-renewal setup failed, but certificate was issued")

            self._disconnect()

            return DeploymentResult(
                success=True,
                message="SSL certificate configured successfully",
                details={
                    "domain": self.config.domain,
                    "auto_renewal": True
                }
            )

        except Exception as e:
            self._disconnect()
            return DeploymentResult(
                success=False,
                message="SSL configuration failed",
                error=str(e)
            )

    def apply_security_hardening(self) -> DeploymentResult:
        """Apply security hardening to the server."""
        try:
            if not self._connect():
                return DeploymentResult(
                    success=False,
                    message="Failed to connect to server",
                    error="SSH connection failed"
                )

            self.logger.info("Applying security hardening...")

            # Use the existing SSL hardening function
            if not provision_hardening(self.client, "basic", self.dry_run, self.verbose):
                self._disconnect()
                return DeploymentResult(
                    success=False,
                    message="Security hardening failed",
                    error="Failed to apply security configurations"
                )

            self._disconnect()

            return DeploymentResult(
                success=True,
                message="Security hardening applied successfully",
                details={
                    "level": "basic",
                    "features": ["firewall", "fail2ban", "ssh_hardening", "auto_updates"]
                }
            )

        except Exception as e:
            self._disconnect()
            return DeploymentResult(
                success=False,
                message="Security hardening failed",
                error=str(e)
            )

    def _connect(self) -> bool:
        """Establish SSH connection."""
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            if self.verbose:
                self.logger.info(f"Connecting to {self.config.ip_address}:{self.config.ssh_port} as {self.config.ssh_user}")

            self.client.connect(
                self.config.ip_address,
                username=self.config.ssh_user,
                key_filename=os.path.expanduser(self.config.ssh_key),
                port=self.config.ssh_port,
                timeout=30
            )

            return True

        except Exception as e:
            self.logger.error(f"SSH connection failed: {str(e)}")
            return False

    def _disconnect(self) -> None:
        """Close SSH connection."""
        if self.client:
            self.client.close()
            self.client = None

    def _setup_web_server(self) -> DeploymentResult:
        """Set up the web server based on configuration."""
        try:
            if self.config.web_server == WebServer.NGINX:
                return self._setup_nginx()
            elif self.config.web_server == WebServer.APACHE:
                return self._setup_apache()
            else:
                return DeploymentResult(
                    success=True,
                    message=f"Web server {self.config.web_server.value} setup skipped (manual configuration required)",
                    details={"web_server": self.config.web_server.value}
                )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message=f"Web server setup failed: {self.config.web_server.value}",
                error=str(e)
            )

    def _setup_nginx(self) -> DeploymentResult:
        """Set up Nginx web server."""
        try:
            if self.verbose:
                self.logger.info("Setting up Nginx web server...")

            # Install Nginx
            run_ssh_command(self.client, "apt install -y nginx", self.dry_run, self.verbose)

            # Create Nginx configuration
            nginx_config = f"""server {{
    listen 80;
    server_name {self.config.domain} www.{self.config.domain};
    root /var/www/{self.config.domain};
    index index.php index.html index.htm;

    location / {{
        try_files $uri $uri/ /index.php?$args;
    }}

    location ~ \\.php$ {{
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }}

    location ~ /\\.ht {{
        deny all;
    }}
}}"""

            # Write Nginx config
            config_path = f"/etc/nginx/sites-available/{self.config.domain}"
            write_config_cmd = f"echo '{nginx_config}' > {config_path}"
            run_ssh_command(self.client, write_config_cmd, self.dry_run, self.verbose)

            # Enable site
            run_ssh_command(self.client, f"ln -sf {config_path} /etc/nginx/sites-enabled/", self.dry_run, self.verbose)
            run_ssh_command(self.client, "rm -f /etc/nginx/sites-enabled/default", self.dry_run, self.verbose)

            # Test and reload Nginx
            run_ssh_command(self.client, "nginx -t", self.dry_run, self.verbose)
            run_ssh_command(self.client, "systemctl reload nginx", self.dry_run, self.verbose)

            return DeploymentResult(
                success=True,
                message="Nginx web server setup completed",
                details={"config_path": config_path}
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="Nginx setup failed",
                error=str(e)
            )

    def _setup_apache(self) -> DeploymentResult:
        """Set up Apache web server."""
        try:
            if self.verbose:
                self.logger.info("Setting up Apache web server...")

            # Install Apache
            run_ssh_command(self.client, "apt install -y apache2", self.dry_run, self.verbose)

            # Enable required modules
            run_ssh_command(self.client, "a2enmod rewrite", self.dry_run, self.verbose)

            # Create Apache configuration
            apache_config = f"""<VirtualHost *:80>
    ServerName {self.config.domain}
    ServerAlias www.{self.config.domain}
    DocumentRoot /var/www/html/{self.config.domain}

    <Directory /var/www/html/{self.config.domain}>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog ${{APACHE_LOG_DIR}}/{self.config.domain}_error.log
    CustomLog ${{APACHE_LOG_DIR}}/{self.config.domain}_access.log combined
</VirtualHost>"""

            # Write Apache config
            config_path = f"/etc/apache2/sites-available/{self.config.domain}.conf"
            write_config_cmd = f"echo '{apache_config}' > {config_path}"
            run_ssh_command(self.client, write_config_cmd, self.dry_run, self.verbose)

            # Enable site
            run_ssh_command(self.client, f"a2ensite {self.config.domain}.conf", self.dry_run, self.verbose)
            run_ssh_command(self.client, "a2dissite 000-default.conf", self.dry_run, self.verbose)

            # Reload Apache
            run_ssh_command(self.client, "systemctl reload apache2", self.dry_run, self.verbose)

            return DeploymentResult(
                success=True,
                message="Apache web server setup completed",
                details={"config_path": config_path}
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="Apache setup failed",
                error=str(e)
            )

    def _setup_database(self) -> DeploymentResult:
        """Set up database server."""
        try:
            if self.verbose:
                self.logger.info("Setting up MySQL database...")

            # Install MySQL
            run_ssh_command(self.client, "apt install -y mysql-server", self.dry_run, self.verbose)

            # Secure MySQL installation
            secure_commands = [
                "mysql -e \"DELETE FROM mysql.user WHERE User='';\"",
                "mysql -e \"DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');\"",
                "mysql -e \"DROP DATABASE IF EXISTS test;\"",
                "mysql -e \"DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';\"",
                "mysql -e \"FLUSH PRIVILEGES;\""
            ]

            for cmd in secure_commands:
                run_ssh_command(self.client, cmd, self.dry_run, self.verbose)

            # Create database and user
            db_name = self.config.name.replace("-", "_") + "_db"
            db_user = self.config.name.replace("-", "_") + "_user"
            db_password = os.urandom(16).hex()  # Generate random password

            create_db_commands = [
                f"mysql -e \"CREATE DATABASE IF NOT EXISTS {db_name};\"",
                f"mysql -e \"CREATE USER IF NOT EXISTS '{db_user}'@'localhost' IDENTIFIED BY '{db_password}';\"",
                f"mysql -e \"GRANT ALL PRIVILEGES ON {db_name}.* TO '{db_user}'@'localhost';\"",
                "mysql -e \"FLUSH PRIVILEGES;\""
            ]

            for cmd in create_db_commands:
                run_ssh_command(self.client, cmd, self.dry_run, self.verbose)

            return DeploymentResult(
                success=True,
                message="MySQL database setup completed",
                details={
                    "database": db_name,
                    "username": db_user,
                    "password": db_password if not self.dry_run else "GENERATED_IN_DRY_RUN"
                }
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="Database setup failed",
                error=str(e)
            )

    def _setup_php(self) -> DeploymentResult:
        """Set up PHP."""
        try:
            if self.verbose:
                self.logger.info("Setting up PHP...")

            # Add PHP repository and install PHP
            php_commands = [
                "add-apt-repository ppa:ondrej/php -y",
                "apt update",
                "apt install -y php8.1 php8.1-fpm php8.1-mysql php8.1-curl php8.1-gd php8.1-mbstring php8.1-xml php8.1-zip php8.1-intl"
            ]

            for cmd in php_commands:
                run_ssh_command(self.client, cmd, self.dry_run, self.verbose)

            # Configure PHP
            if self.config.web_server == WebServer.NGINX:
                run_ssh_command(self.client, "systemctl enable php8.1-fpm", self.dry_run, self.verbose)
                run_ssh_command(self.client, "systemctl start php8.1-fpm", self.dry_run, self.verbose)

            return DeploymentResult(
                success=True,
                message="PHP setup completed",
                details={"version": "8.1"}
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="PHP setup failed",
                error=str(e)
            )

    def _setup_wordpress(self) -> DeploymentResult:
        """Set up WordPress configuration if not exists."""
        try:
            if self.verbose:
                self.logger.info("Setting up WordPress configuration...")

            # Determine web root
            if self.config.web_server == WebServer.NGINX:
                web_root = f"/var/www/{self.config.domain}"
            else:
                web_root = f"/var/www/html/{self.config.domain}"

            # Check if WordPress already exists
            wp_config_check = f"test -f {web_root}/wp-config.php && echo 'exists' || echo 'missing'"
            wp_status = run_ssh_command(self.client, wp_config_check, self.dry_run, self.verbose)

            if "exists" in wp_status:
                return DeploymentResult(
                    success=True,
                    message="WordPress configuration already exists",
                    details={"status": "existing"}
                )

            # Download and extract WordPress
            wp_commands = [
                f"cd /tmp && wget https://wordpress.org/latest.tar.gz",
                "tar -xzf /tmp/latest.tar.gz -C /tmp",
                f"cp -r /tmp/wordpress/* {web_root}/",
                f"chown -R www-data:www-data {web_root}",
                "rm -rf /tmp/wordpress /tmp/latest.tar.gz"
            ]

            for cmd in wp_commands:
                run_ssh_command(self.client, cmd, self.dry_run, self.verbose)

            return DeploymentResult(
                success=True,
                message="WordPress setup completed",
                details={"web_root": web_root}
            )

        except Exception as e:
            return DeploymentResult(
                success=False,
                message="WordPress setup failed",
                error=str(e)
            )