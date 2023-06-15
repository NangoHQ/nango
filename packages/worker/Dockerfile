FROM node:18-slim

RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV SERVER_RUN_MODE=DOCKERIZED

WORKDIR /usr/nango-worker/src

COPY packages/shared/ packages/shared/
COPY packages/node-client/ packages/node-client/
COPY packages/worker/ packages/worker/
COPY package*.json ./

RUN npm pkg delete scripts.prepare
RUN npm install --omit=dev

CMD [ "node", "packages/worker/dist/worker.js" ]
