FROM node:18-slim

RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV SERVER_RUN_MODE=DOCKERIZED

WORKDIR /nango

COPY packages/node-client/ packages/node-client/
COPY packages/shared/ packages/shared/
COPY packages/persist/ packages/persist/
COPY packages/utils/ packages/utils/
COPY package*.json ./

RUN npm pkg delete scripts.prepare
RUN npm install --omit=dev

CMD [ "node", "/nango/packages/persist/dist/app.js", "80", "dockerized-persist" ]
