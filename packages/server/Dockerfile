FROM node:20.12.2-slim

ENV SERVER_RUN_MODE=DOCKERIZED
ENV NANGO_DB_MIGRATION_FOLDER=./packages/shared/lib/db/migrations

RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/nango-server/src

COPY packages/server/ packages/server/
COPY package*.json ./
COPY packages/webapp/build/ packages/webapp/build/
COPY packages/shared/ packages/shared/
COPY packages/utils/ packages/utils/
COPY packages/node-client/ packages/node-client/

RUN npm pkg delete scripts.prepare
RUN npm install

CMD [ "node", "packages/server/dist/server.js" ]
