version: '3.8'
services:
  app:
    build:
      dockerfile: Dockerfile
    container_name: %%SITE_NAME%%_app
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - ./www:/var/www/html
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
      - ./www:/var/www/html
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - app
    networks:
      - bedrock_shared_network

networks:
  bedrock_shared_network:
    external: true