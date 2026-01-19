from forge.utils.ssh import SSHConnection
from forge.utils.logging import logger

def setup_fail2ban(connection: SSHConnection, email: str = "root@localhost"):
    """
    Install and configure Fail2Ban on a remote server.
    
    Args:
        connection: SSHConnection object
        email: Email for Fail2Ban notifications
    """
    logger.info("Installing Fail2Ban...")
    
    # Install Fail2Ban
    connection.run("apt-get update && apt-get install -y fail2ban")

    # Configure jail.local
    jail_local_content = f"""
[DEFAULT]
destemail = {email}
sender = fail2ban@$(hostname)
mta = sendmail
action = %(action_mwl)s

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 3

[nginx-botsearch]
enabled = true
filter = nginx-botsearch
port = http,https
logpath = /var/log/nginx/access.log
maxretry = 2
bantime = 86400

[wordpress-hard]
enabled = true
filter = wordpress-hard
logpath = /var/log/auth.log
maxretry = 3
port = http,https
    """
    
    connection.upload_content(jail_local_content, "/etc/fail2ban/jail.local")
    
    # Create wordpress-hard filter
    wp_filter_content = """
[Definition]
failregex = ^<HOST> -.*"(GET|POST).*/wp-login.php.*"
            ^<HOST> -.*"(GET|POST).*/xmlrpc.php.*"
ignoreregex =
    """
    connection.upload_content(wp_filter_content, "/etc/fail2ban/filter.d/wordpress-hard.conf")

    # Restart service
    connection.run("systemctl restart fail2ban")
    connection.run("systemctl enable fail2ban")
    
    logger.info("Fail2Ban setup complete.")
