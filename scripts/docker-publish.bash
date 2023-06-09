#!/bin/bash

package=$1
version=$2
tagLatest=$3
ENV=$4

PACKAGE_NAME=${package:6}

# allow for custom worker cloud name
if [ "$ENV" == "staging" ]; then
    npm run build:staging && docker buildx build --platform linux/amd64 -f packages/$PACKAGE_NAME/Dockerfile -t nangohq/nango-cloud-staging:$version -t nangohq/nango-cloud-staging:latest . --no-cache --output type=registry
fi

if [ "$ENV" == "prod" ]; then
    npm run build:prod && docker buildx build --platform linux/amd64 -f packages/$PACKAGE_NAME/Dockerfile -t nangohq/nango-cloud:$version -t nangohq/nango-cloud:latest . --no-cache --output type=registry
fi

if [ "$ENV" == "hosted" ]; then
    if [ "$tagLatest" == "true" ]; then
      docker buildx build --platform linux/amd64 -f packages/$PACKAGE_NAME/Dockerfile -t nangohq/$package:$version -t nangohq/$package:latest . --no-cache --output type=registry
    else
      docker buildx build --platform linux/amd64 -f packages/$PACKAGE_NAME/Dockerfile -t nangohq/$package:$version . --no-cache --output type=registry
    fi
fi


