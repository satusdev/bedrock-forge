services:
  app:
    build:
      dockerfile: Dockerfile
    container_name: %%SITE_NAME%%_app
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - HOST_UID=${HOST_UID}
      - HOST_GID=${HOST_GID}
    volumes:
      - .:/var/www/html
      - uploads-data:/var/www/html/web/app/uploads
      - ./uploads.ini:/usr/local/etc/php/conf.d/uploads.ini
    networks:
      - bedrock_shared_network

  webserver:
    image: nginx:stable-alpine
    container_name: %%SITE_NAME%%_webserver
    restart: unless-stopped
    ports:
      - "%%APP_PORT%%:80"
    volumes:
      - uploads-data:/var/www/html/web/app/uploads
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - app
    networks:
      - bedrock_shared_network

networks:
  bedrock_shared_network:
    external: true

volumes:
  dbdata:
  uploads-data:
