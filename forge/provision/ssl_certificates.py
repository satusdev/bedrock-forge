import paramiko
from ..utils.errors import ForgeError
from ..utils.logging import logger
import time
import re
import datetime

def run_ssh_command(client: paramiko.SSHClient, command: str, dry_run: bool = False, verbose: bool = False) -> str:
    """Execute a command via SSH and return output."""
    if dry_run:
        logger.info(f"Dry run: Would execute SSH command: {command}")
        return ""
    try:
        stdin, stdout, stderr = client.exec_command(command)
        output = stdout.read().decode().strip()
        error = stderr.read().decode().strip()
        if error and "Warning" not in error:  # Ignore warnings
            raise ForgeError(f"SSH command failed: {command}\nError: {error}")
        if verbose:
            logger.info(f"SSH command executed: {command}")
            if output:
                logger.info(f"Output: {output}")
        return output
    except Exception as e:
        raise ForgeError(f"SSH command failed: {command}\nError: {str(e)}")

def provision_ssl_via_certbot(client: paramiko.SSHClient, domain: str, email: str = None, dry_run: bool = False, verbose: bool = False) -> bool:
    """Provision SSL certificate using Certbot via SSH."""
    if verbose:
        logger.info(f"Provisioning SSL certificate for {domain} via Certbot")

    if dry_run:
        logger.info(f"Dry run: Would provision SSL certificate for {domain}")
        return True

    # Use default email if none provided
    if not email:
        email = f"admin@{domain}"

    try:
        # Install Certbot and Nginx plugin if not already installed
        if verbose:
            logger.info("Installing Certbot and Nginx plugin...")

        install_cmd = "apt update && apt install -y certbot python3-certbot-nginx"
        run_ssh_command(client, install_cmd, dry_run, verbose)

        # Check if Nginx is running
        nginx_status = run_ssh_command(client, "systemctl is-active nginx", dry_run, verbose)
        if nginx_status != "active":
            if verbose:
                logger.info("Starting Nginx...")
            run_ssh_command(client, "systemctl start nginx && systemctl enable nginx", dry_run, verbose)

        # Request SSL certificate
        if verbose:
            logger.info(f"Requesting SSL certificate for {domain}")

        certbot_cmd = f"certbot --nginx -d {domain} --non-interactive --agree-tos --email {email} --redirect"
        output = run_ssh_command(client, certbot_cmd, dry_run, verbose)

        # Verify certificate was issued
        cert_check_cmd = f"certbot certificates | grep -A 5 '{domain}'"
        cert_info = run_ssh_command(client, cert_check_cmd, dry_run, verbose)

        if "Certificate Name: " + domain in cert_info:
            if verbose:
                logger.info(f"SSL certificate successfully provisioned for {domain}")
            return True
        else:
            raise ForgeError(f"SSL certificate issuance failed for {domain}")

    except Exception as e:
        raise ForgeError(f"Failed to provision SSL certificate for {domain}: {str(e)}")

def setup_ssl_auto_renewal(client: paramiko.SSHClient, domain: str, dry_run: bool = False, verbose: bool = False) -> bool:
    """Set up automatic SSL certificate renewal via cron job."""
    if verbose:
        logger.info(f"Setting up SSL auto-renewal for {domain}")

    if dry_run:
        logger.info(f"Dry run: Would set up SSL auto-renewal for {domain}")
        return True

    try:
        # Test renewal process first
        if verbose:
            logger.info("Testing SSL renewal process...")

        test_cmd = "certbot renew --dry-run"
        run_ssh_command(client, test_cmd, dry_run, verbose)

        # Add cron job for renewal (twice daily at 3:33 AM and PM)
        cron_job = "33 3,15 * * * /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx'"

        # Check if cron job already exists
        existing_cron = run_ssh_command(client, "crontab -l 2>/dev/null || true", dry_run, verbose)

        if cron_job not in existing_cron:
            # Add the cron job
            add_cron_cmd = f'(crontab -l 2>/dev/null; echo "{cron_job}") | crontab -'
            run_ssh_command(client, add_cron_cmd, dry_run, verbose)

            if verbose:
                logger.info("SSL auto-renewal cron job added")
        else:
            if verbose:
                logger.info("SSL auto-renewal cron job already exists")

        return True

    except Exception as e:
        raise ForgeError(f"Failed to set up SSL auto-renewal for {domain}: {str(e)}")

def revoke_ssl_certificate(client: paramiko.SSHClient, domain: str, dry_run: bool = False, verbose: bool = False) -> bool:
    """Revoke SSL certificate for a domain."""
    if verbose:
        logger.info(f"Revoking SSL certificate for {domain}")

    if dry_run:
        logger.info(f"Dry run: Would revoke SSL certificate for {domain}")
        return True

    try:
        revoke_cmd = f"certbot revoke --cert-name {domain} --non-interactive"
        run_ssh_command(client, revoke_cmd, dry_run, verbose)

        if verbose:
            logger.info(f"SSL certificate revoked for {domain}")
        return True

    except Exception as e:
        raise ForgeError(f"Failed to revoke SSL certificate for {domain}: {str(e)}")

def check_ssl_certificate(client: paramiko.SSHClient, domain: str, dry_run: bool = False, verbose: bool = False) -> dict:
    """Check SSL certificate status and details."""
    if verbose:
        logger.info(f"Checking SSL certificate for {domain}")

    if dry_run:
        logger.info(f"Dry run: Would check SSL certificate for {domain}")
        return {"status": "dry-run", "days_remaining": 30}

    try:
        # Check certificate with openssl
        cert_check_cmd = f"echo | openssl s_client -servername {domain} -connect {domain}:443 2>/dev/null | openssl x509 -noout -dates"
        cert_info = run_ssh_command(client, cert_check_cmd, dry_run, verbose)

        if not cert_info:
            return {"status": "not_found", "days_remaining": 0}

        # Parse certificate dates
        not_before = None
        not_after = None

        for line in cert_info.split('\n'):
            if line.startswith('notBefore='):
                not_before = line.split('=', 1)[1].strip()
            elif line.startswith('notAfter='):
                not_after = line.split('=', 1)[1].strip()

        if not_after:
            # Calculate days remaining
            try:
                # Try to parse the date (various formats possible)
                import dateutil.parser
                expiry_date = dateutil.parser.parse(not_after)
                current_date = datetime.datetime.now(expiry_date.tzinfo)
                days_remaining = (expiry_date - current_date).days
            except (ImportError, ValueError):
                # Fallback to simple calculation
                days_remaining = 30  # Default assumption

            status = "valid" if days_remaining > 0 else "expired"

            return {
                "status": status,
                "not_before": not_before,
                "not_after": not_after,
                "days_remaining": days_remaining
            }

        return {"status": "invalid", "days_remaining": 0}

    except Exception as e:
        if verbose:
            logger.info(f"Could not check SSL certificate for {domain}: {str(e)}")
        return {"status": "error", "error": str(e), "days_remaining": 0}

def provision_hardening(client: paramiko.SSHClient, level: str = "basic", dry_run: bool = False, verbose: bool = False) -> bool:
    """Provision server hardening: firewall, fail2ban, SSH security."""
    if verbose:
        logger.info(f"Applying server hardening (level: {level})")

    if dry_run:
        logger.info(f"Dry run: Would apply server hardening (level: {level})")
        return True

    try:
        # Update system packages
        if verbose:
            logger.info("Updating system packages...")

        update_cmd = "apt update && apt upgrade -y"
        run_ssh_command(client, update_cmd, dry_run, verbose)

        # Install security packages
        security_packages = "ufw fail2ban unattended-upgrades"
        run_ssh_command(client, f"apt install -y {security_packages}", dry_run, verbose)

        # Configure UFW firewall
        if verbose:
            logger.info("Configuring UFW firewall...")

        # Basic rules
        ufw_commands = [
            "ufw default deny incoming",
            "ufw default allow outgoing",
            "ufw allow OpenSSH",
            "ufw allow 'Nginx Full' || ufw allow 80/tcp && ufw allow 443/tcp"
        ]

        # Additional rules for higher security levels
        if level in ["medium", "strict"]:
            ufw_commands.extend([
                "ufw deny 5353/udp",  # mDNS
                "ufw deny 1900/udp",  # UPnP
            ])

        if level == "strict":
            # Rate limiting for SSH
            ufw_commands.append("ufw limit OpenSSH")

        # Enable firewall
        ufw_commands.append("ufw --force enable")

        for cmd in ufw_commands:
            run_ssh_command(client, cmd, dry_run, verbose)

        # Configure fail2ban
        if verbose:
            logger.info("Configuring fail2ban...")

        # Create fail2ban jail.local for SSH protection
        fail2ban_config = """[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
"""

        if level == "strict":
            fail2ban_config = """[DEFAULT]
bantime = 86400
findtime = 600
maxretry = 2

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 2
bantime = 86400
"""

        # Write fail2ban configuration
        write_config_cmd = f"echo '{fail2ban_config}' > /etc/fail2ban/jail.local"
        run_ssh_command(client, write_config_cmd, dry_run, verbose)

        # Restart fail2ban
        run_ssh_command(client, "systemctl restart fail2ban && systemctl enable fail2ban", dry_run, verbose)

        # SSH hardening for medium and strict levels
        if level in ["medium", "strict"]:
            if verbose:
                logger.info("Applying SSH hardening...")

            # Backup original SSH config
            run_ssh_command(client, "cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup", dry_run, verbose)

            # SSH hardening configurations
            ssh_hardening_cmds = [
                "sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config",
                "sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config",
                "sed -i 's/#PermitEmptyPasswords no/PermitEmptyPasswords no/' /etc/ssh/sshd_config",
                "sed -i 's/#X11Forwarding yes/X11Forwarding no/' /etc/ssh/sshd_config"
            ]

            if level == "strict":
                ssh_hardening_cmds.extend([
                    "sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config",
                    "echo 'ClientAliveInterval 300' >> /etc/ssh/sshd_config",
                    "echo 'ClientAliveCountMax 2' >> /etc/ssh/sshd_config"
                ])

            for cmd in ssh_hardening_cmds:
                run_ssh_command(client, cmd, dry_run, verbose)

            # Restart SSH service
            run_ssh_command(client, "systemctl restart sshd", dry_run, verbose)

        # Configure unattended-upgrades
        if verbose:
            logger.info("Configuring automatic security updates...")

        unattended_config = """APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
Unattended-Upgrade::Mail "root";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
"""

        write_unattended_cmd = f"echo '{unattended_config}' > /etc/apt/apt.conf.d/50unattended-upgrades"
        run_ssh_command(client, write_unattended_cmd, dry_run, verbose)

        run_ssh_command(client, "systemctl restart unattended-upgrades", dry_run, verbose)

        if verbose:
            logger.info(f"Server hardening completed (level: {level})")

        return True

    except Exception as e:
        raise ForgeError(f"Failed to apply server hardening: {str(e)}")

def verify_ssl_domain(client: paramiko.SSHClient, domain: str, dry_run: bool = False, verbose: bool = False) -> bool:
    """Verify that domain points to the server and is ready for SSL."""
    if verbose:
        logger.info(f"Verifying domain {domain} points to this server...")

    if dry_run:
        logger.info(f"Dry run: Would verify domain {domain}")
        return True

    try:
        # Get server's public IP
        server_ip_cmd = "curl -s ifconfig.me || curl -s ipinfo.io/ip || hostname -I | awk '{print $1}'"
        server_ip = run_ssh_command(client, server_ip_cmd, dry_run, verbose).split()[0]

        # Check if domain resolves to server IP
        dns_check_cmd = f"dig +short {domain}"
        domain_ip = run_ssh_command(client, dns_check_cmd, dry_run, verbose).strip()

        if not domain_ip:
            raise ForgeError(f"Domain {domain} does not resolve to any IP address")

        if server_ip not in domain_ip:
            raise ForgeError(f"Domain {domain} resolves to {domain_ip}, but server IP is {server_ip}")

        if verbose:
            logger.info(f"Domain {domain} correctly resolves to server IP {server_ip}")

        return True

    except Exception as e:
        raise ForgeError(f"Domain verification failed for {domain}: {str(e)}")