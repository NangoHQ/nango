FROM node:20.12.2-slim

RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV SERVER_RUN_MODE=DOCKERIZED

WORKDIR /nango

COPY packages/node-client/ packages/node-client/
COPY packages/shared/ packages/shared/
COPY packages/utils/ packages/utils/
COPY packages/records/ packages/records/
COPY packages/data-ingestion/ packages/data-ingestion/
COPY packages/jobs/ packages/jobs/
COPY packages/logs/ packages/logs/
COPY packages/runner/ packages/runner/
COPY packages/orchestrator/ packages/orchestrator/
COPY package*.json ./

RUN npm pkg delete scripts.prepare
RUN npm ci --omit=dev

CMD [ "node", "/nango/packages/jobs/dist/app.js" ]
