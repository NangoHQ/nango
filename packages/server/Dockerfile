FROM node:20.18.1-bookworm-slim

ENV SERVER_RUN_MODE=DOCKERIZED

RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/nango-server/src

COPY packages/server/ packages/server/
COPY package*.json ./
COPY packages/webapp/build/ packages/webapp/build/
COPY packages/connect-ui/ packages/connect-ui/
COPY packages/shared/ packages/shared/
COPY packages/utils/ packages/utils/
COPY packages/kvstore/ packages/kvstore/
COPY packages/logs/ packages/logs/
COPY packages/database/ packages/database/
COPY packages/webhooks/ packages/webhooks/
COPY packages/node-client/ packages/node-client/
COPY packages/nango-yaml/ packages/nango-yaml/
COPY packages/records/ packages/records/
COPY packages/scheduler/ packages/scheduler/
COPY packages/orchestrator/ packages/orchestrator/
COPY packages/keystore/ packages/keystore/
COPY packages/fleet/ packages/fleet/
COPY packages/providers/ packages/providers/
COPY packages/runner-sdk/ packages/runner-sdk/

RUN npm pkg delete scripts.prepare
RUN npm ci --omit=dev

CMD ["packages/server/entrypoint.sh"]
