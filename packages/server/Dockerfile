FROM node:18-slim

ENV SERVER_RUN_MODE=DOCKERIZED

WORKDIR /usr/nango-server/src

COPY packages/server/ packages/server/
COPY package*.json ./
COPY packages/webapp/build/ packages/webapp/build/

RUN npm pkg delete scripts.prepare
RUN npm install --omit=dev

CMD [ "node", "packages/server/dist/server.js" ]
