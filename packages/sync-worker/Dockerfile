FROM node:18-slim

ENV SERVER_RUN_MODE=DOCKERIZED

WORKDIR /usr/nango-sync-server/src

COPY packages/shared/ packages/shared/
COPY packages/node-client/ packages/node-client/
COPY packages/sync-worker/ packages/sync-worker/
COPY package*.json ./

RUN npm pkg delete scripts.prepare
RUN npm install --omit=dev

CMD [ "node", "packages/sync-worker/dist/worker.js" ]
