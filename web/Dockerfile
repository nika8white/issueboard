# syntax=docker/dockerfile:1
FROM node:25-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# nginx-unprivileged runs as a non-root user and listens on 8080
FROM nginxinc/nginx-unprivileged:stable-alpine
# Pick up Alpine security fixes released after the base image was built
# (e.g. brotli-libs CVE-2026-111497), then drop back to the image's non-root user.
USER root
RUN apk upgrade --no-cache
USER 101
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080