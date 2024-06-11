# ------------------
# Tmp image to precompile
# ------------------
FROM badouralix/curl-jq AS precompile

COPY tsconfig.build.json /tsconfig.build.json
RUN jq '. | del(.references[] | select(.path == "packages/cli"))' tsconfig.build.json > tsconfig.docker.json

# ------------------
# New tmp image
# ------------------
FROM node:20.12.2-bullseye-slim AS build

# Setup the app WORKDIR
WORKDIR /app/tmp

# Copy and install dependencies separately from the app's code
# To leverage Docker's cache when no dependency has changed
COPY packages/data-ingestion/package.json ./packages/data-ingestion/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/frontend/package.json ./packages/frontend/package.json
COPY packages/jobs/package.json ./packages/jobs/package.json
COPY packages/kvstore/package.json ./packages/kvstore/package.json
COPY packages/logs/package.json ./packages/logs/package.json
COPY packages/node-client/package.json ./packages/node-client/package.json
COPY packages/orchestrator/package.json ./packages/orchestrator/package.json
COPY packages/persist/package.json ./packages/persist/package.json
COPY packages/records/package.json ./packages/records/package.json
COPY packages/runner/package.json ./packages/runner/package.json
COPY packages/scheduler/package.json ./packages/scheduler/package.json
COPY packages/server/package.json ./packages/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/utils/package.json ./packages/utils/package.json
COPY packages/webapp/package.json ./packages/webapp/package.json
COPY packages/webhooks/package.json ./packages/webhooks/package.json
COPY package*.json  ./

# Install every dependencies
RUN true \
  && npm ci

# At this stage we copy back all sources
COPY --from=precompile --chown=node:node tsconfig.docker.json /app/tmp
COPY . /app/tmp

# Build the backend separately because it can be cached --in the same build for production and staging-- when we change the env vars
RUN true \
  && npm run ts-build:docker

# /!\ Do not set NODE_ENV=production before building, it will break some modules
# ENV NODE_ENV=production
ARG image_env
ARG posthog_key
ARG sentry_key

# TODO: remove the need for this
ENV REACT_APP_ENV $image_env
ENV REACT_APP_PUBLIC_POSTHOG_HOST https://app.posthog.com
ENV REACT_APP_PUBLIC_POSTHOG_KEY $posthog_key
ENV REACT_APP_PUBLIC_SENTRY_KEY $sentry_key

# Build the frontend
RUN true \
  && npm run -w @nangohq/webapp build

# Clean src
RUN true \
  && rm -rf packages/*/src \
  && rm -rf packages/*/lib \
  && rm -rf packages/webapp/public \
  && rm -rf packages/webapp/node_modules

# Clean dev dependencies
RUN true \
  && npm prune --omit=dev --omit=peer --omit=optional

# ---- Web ----
# Resulting new, minimal image
FROM node:20.12.2-bullseye-slim as web


# - Bash is just to be able to log inside the image and have a decent shell
RUN true \
  && apt update && apt-get install -y bash ca-certificates \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && apt-get purge -y --auto-remove -o APT::AutoRemove::RecommendsImportant=false

# Do not use root to run the app
USER node

WORKDIR /app/nango

# Code
COPY --from=build --chown=node:node /app/tmp /app/nango

ARG image_env
ARG git_hash

ENV PORT=8080
ENV NODE_ENV=production
ENV IMAGE_ENV $image_env
ENV GIT_HASH $git_hash
ENV SERVER_RUN_MODE=DOCKERIZED

EXPOSE 8080
