# Use official PHP 8.2 FPM image as base
FROM php:8.2-fpm

# Set non-interactive frontend for package installations
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update -y --fix-missing && \
    apt-get install -y --no-install-recommends \
        git curl unzip libzip-dev libpng-dev libonig-dev libxml2-dev \
        libjpeg-dev libfreetype6-dev libssl-dev mariadb-client default-libmysqlclient-dev build-essential \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Configure and install PHP extensions
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) pdo_mysql mysqli zip gd opcache exif xml bcmath \
    && pecl install xdebug && docker-php-ext-enable xdebug

# Install Composer
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Install WP-CLI
RUN curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
    && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp

# Set working directory
WORKDIR /var/www/html

# Set www-data UID/GID from build args (default to 33 if not provided)
ARG HOST_UID=33
ARG HOST_GID=33
RUN usermod -u $HOST_UID www-data && groupmod -g $HOST_GID www-data

# Copy entrypoint script
COPY template/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Ensure PHP-FPM runs as www-data
RUN sed -i 's/user = www-data/user = www-data/' /usr/local/etc/php-fpm.d/www.conf && \
    sed -i 's/group = www-data/group = www-data/' /usr/local/etc/php-fpm.d/www.conf && \
    sed -i 's/;listen.owner = www-data/listen.owner = www-data/' /usr/local/etc/php-fpm.d/www.conf && \
    sed -i 's/;listen.group = www-data/listen.group = www-data/' /usr/local/etc/php-fpm.d/www.conf

# Expose port 9000 for PHP-FPM
EXPOSE 9000

# Use entrypoint script
ENTRYPOINT ["/entrypoint.sh"]
CMD ["php-fpm"]
