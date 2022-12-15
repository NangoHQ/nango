FROM node:18-slim

ENV SERVER_RUN_MODE=DOCKERIZED

WORKDIR /usr/pizzly-server/src

COPY packages/server/ packages/server/
COPY package*.json ./

RUN npm install --omit=dev

ENTRYPOINT [ "node", "packages/server/dist/server.js" ]