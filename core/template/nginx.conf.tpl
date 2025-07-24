server {
    listen 80;
    server_name %%SERVER_NAME%%;
    root /var/www/html/web;
    index index.php index.html;

    # Add trailing slash to */wp-admin requests.
    rewrite /wp-admin$ $scheme://$host$uri/ permanent;

    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    # Direct PHP requests to the FPM service
    location ~ \.php$ {
        fastcgi_pass app:9000;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    # Handle /wp-admin requests
    location ~ ^/wp-admin/ {
        try_files $uri $uri/ /wp/wp-admin/index.php?$args;
        location ~ \.php$ {
            fastcgi_pass app:9000;
            fastcgi_index index.php;
            include fastcgi_params;
            fastcgi_param SCRIPT_FILENAME $document_root/wp$fastcgi_script_name; # Point to /web/wp/
        }
    }

    # Handle wp-login.php
    location = /wp-login.php {
        try_files $uri /wp/wp-login.php?$args;
        fastcgi_pass app:9000;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root/wp/wp-login.php; # Point to /web/wp/
    }

    # Deny access to sensitive files
    location ~* /(composer\.(json|lock)|wp-config\.php|wp/wp-config\.php|\.env.*|phpcs\.xml|phpunit\.xml.*)$ {
        deny all;
    }

    # Deny access to files starting with a dot
    location ~ /\. {
        deny all;
    }

    # Handle static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff2?|ttf|otf|eot|svg)$ {
        expires max;
        log_not_found off;
    }
}
