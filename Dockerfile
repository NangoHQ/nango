# This is the Dockerfile for building a production image with Pizzly

# Build image
FROM node:14-slim

WORKDIR /app

# Copy in dependencies for building
COPY *.json ./
COPY yarn.lock ./
# COPY config ./config
COPY integrations ./integrations/
COPY src ./src/
COPY tests ./tests/
COPY views ./views/

RUN yarn install


# Actual image to run from.
FROM node:14-slim

# Make sure we have ca certs for TLS
RUN apt-get update && apt-get install -y \
  curl \
  wget \
  gnupg2 ca-certificates libnss3  \
  git

# Make a directory for the node user. Not running Pizzly as root.
RUN mkdir /home/node/app && chown -R node:node /home/node/app
WORKDIR /home/node/app

USER node

# Startup script
COPY --chown=node:node ./startup.sh ./startup.sh
RUN chmod +x ./startup.sh
# COPY from first container
COPY --chown=node:node --from=0 /app/package.json ./package.json
COPY --chown=node:node --from=0 /app/dist/ .
COPY --chown=node:node --from=0 /app/views ./views
COPY --chown=node:node --from=0 /app/node_modules ./node_modules

# Run the startup script
CMD ./startup.sh

EXPOSE 80
