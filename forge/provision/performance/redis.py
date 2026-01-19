from forge.utils.ssh import SSHConnection
from forge.utils.logging import logger

def install_redis(connection: SSHConnection):
    """
    Install and configure Redis Object Cache.
    
    Args:
        connection: SSHConnection object
    """
    logger.info("Installing Redis...")
    
    # Install Redis Server and PHP extension
    connection.run("apt-get update && apt-get install -y redis-server php-redis")
    
    # Configure Redis (basic security)
    # Bind to localhost only by default (usually default in recent versions but good to ensure)
    connection.run("sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf")
    
    # Set maxmemory policy (optional, but good for cache)
    # connection.run("echo 'maxmemory-policy allkeys-lru' >> /etc/redis/redis.conf")
    
    connection.run("systemctl restart redis-server")
    connection.run("systemctl enable redis-server")
    
    logger.info("Redis installed and configured.")

def configure_wordpress_redis(connection: SSHConnection, site_path: str):
    """
    Configure WordPress to use Redis (requires WP Redis plugin or similar).
    We assume Bedrock structure/env vars for salt/keys might benefit from object-cache.php drop-in.
    
    This is a basic setup; typically involving dropping the object-cache.php
    """
    logger.info(f"Configuring WordPress Redis for {site_path}...")
    
    # Check if WP-CLI is available to install plugin
    # connection.run(f"cd {site_path} && wp plugin install redis-cache --activate")
    # connection.run(f"cd {site_path} && wp redis enable")
    
    logger.info("WordPress Redis configuration steps vary by plugin - ensure 'redis-cache' is active.")
