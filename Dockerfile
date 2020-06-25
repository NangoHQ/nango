# This is the Dockerfile for building a production image with Pizzly


# Build image 
FROM node:13.5.0-alpine3.11

WORKDIR /app

# Copy in dependencies for building
COPY *.json ./
COPY yarn.lock ./
COPY config ./config
COPY integrations ./integrations/
COPY src ./src/
COPY tests ./tests/
COPY views ./views/

RUN yarn install 


# Actual image to run from.
FROM node:13.5.0-alpine3.11

# Make sure we have ca certs for TLS
RUN apk --no-cache add ca-certificates

# Make a directory for the node user. Not running Pizzly as root.
RUN mkdir /home/node/app && chown -R node:node /home/node/app
WORKDIR /home/node/app

USER node

COPY --chown=node:node --from=0 /app/dist/ .
COPY --chown=node:node --from=0 /app/views ./views
COPY --chown=node:node --from=0 /app/node_modules ./node_modules

CMD ["node", "src"]
