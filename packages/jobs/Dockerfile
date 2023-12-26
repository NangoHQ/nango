FROM node:18-slim

RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV SERVER_RUN_MODE=DOCKERIZED

WORKDIR /nango

COPY packages/node-client/ packages/node-client/
COPY packages/shared/ packages/shared/
COPY packages/jobs/ packages/jobs/
COPY packages/runner/ packages/runner/
COPY package*.json ./

RUN npm pkg delete scripts.prepare
RUN npm install --omit=dev

CMD [ "node", "/nango/packages/jobs/dist/app.js" ]
