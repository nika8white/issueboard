# syntax=docker/dockerfile:1

# Stage 1: install all dependencies (cached until package*.json changes)
FROM node:25-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: dev server with hot reload (used by compose.yaml, target: dev)
FROM deps AS dev
COPY tsconfig.json ./
COPY src ./src
CMD ["npm", "run", "dev"]^

# Stage 3: compile TypeScript to dist/
FROM dev AS build
RUN npm run build

# Stage 4: the slim image that actually ships
FROM node:25-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
# The image's "node" user, by numeric UID: Kubernetes' runAsNonRoot
# check (Module 5) can only verify numeric users.
USER 1000
EXPOSE 3000
CMD ["node", "dist/server.js"]