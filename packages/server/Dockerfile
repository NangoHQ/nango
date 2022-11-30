FROM node:18-slim

ENV PORT=3004
ENV PIZZLY_SERVER_RUN_MODE=DOCKERIZED
ENV PIZZLY_DB_MIGRATION_FOLDER=./packages/server/lib/db/migrations

WORKDIR /usr/pizzly-server/src

COPY packages/server/ packages/server/
COPY package*.json ./

RUN npm install --omit=dev

EXPOSE 3004

ENTRYPOINT [ "node", "packages/server/dist/server.js" ]