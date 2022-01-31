# This is the Dockerfile for building a development image with Pizzly

# Build image 
FROM node:14-alpine

WORKDIR /app

# Copy in dependencies for building
COPY . ./

RUN yarn install && yarn build

# Make sure we have ca certs for TLS
RUN apk --no-cache add ca-certificates

CMD ["node", "./dist/src/index.js"]
