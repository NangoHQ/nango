FROM node:18-slim

ENV SERVER_RUN_MODE=DOCKERIZED
ENV NANGO_DB_MIGRATION_FOLDER=./packages/shared/lib/db/migrations

WORKDIR /usr/nango-server/src

COPY packages/server/ packages/server/
COPY package*.json ./
COPY packages/webapp/build/ packages/webapp/build/
COPY packages/shared/ packages/shared/

RUN npm pkg delete scripts.prepare
RUN npm install --omit=dev

CMD [ "node", "packages/server/dist/server.js" ]
