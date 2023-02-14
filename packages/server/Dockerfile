FROM node:18-slim

ENV SERVER_RUN_MODE=DOCKERIZED

WORKDIR /usr/nango-server/src

COPY packages/auth/ packages/auth/
COPY packages/server/ packages/server/
COPY package*.json ./

RUN npm install --omit=dev

CMD [ "node", "packages/server/dist/server.js" ]