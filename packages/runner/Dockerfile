FROM node:20.18.1-bookworm-slim

RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV SERVER_RUN_MODE=DOCKERIZED

WORKDIR /nango

COPY packages/node-client/ packages/node-client/
COPY packages/nango-yaml/ packages/nango-yaml/
COPY packages/shared/ packages/shared/
COPY packages/utils/ packages/utils/
COPY packages/database/ packages/database/
COPY packages/runner/ packages/runner/
COPY packages/providers/ packages/providers/
COPY packages/runner-sdk/ packages/runner-sdk/
COPY package*.json ./

RUN npm pkg delete scripts.prepare
RUN npm ci --omit=dev

CMD [ "node", "/nango/packages/runner/dist/app.js", "80", "dockerized-runner" ]
