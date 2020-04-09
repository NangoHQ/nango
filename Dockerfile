# # Biulder
FROM node:10.16-alpine
WORKDIR /app
# needed by babel
RUN apk add --update \
  python \
  python-dev \
  build-base \
  make

COPY package.json .
COPY yarn.lock .
ARG npm_token
RUN echo "//registry.npmjs.org/:_authToken=$npm_token" > .npmrc 
RUN yarn install --frozen-lockfile

COPY package.json .
COPY yarn.lock .

COPY --from=builder /app/.webpack/src/ .
COPY --from=builder /app/.webpack/service/ .

RUN yarn add  newrelic
RUN yarn add sqreen

ENV PORT=8080

CMD ["node", "server.js"]
