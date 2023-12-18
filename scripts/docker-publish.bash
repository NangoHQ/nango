#!/bin/bash

package=$1
version=$2
tagLatest=$3
ENV=$4

PACKAGE_NAME=${package:6}


if [ "$PACKAGE_NAME" == "jobs" ] || [ "$PACKAGE_NAME" == "runner" ]; then
    if [ "$ENV" == "staging" ]; then
        npm run ts-build && docker build -f packages/$PACKAGE_NAME/Dockerfile --platform linux/amd64 -t nangohq/$package:$(git rev-parse --short HEAD) -t nangohq/$package:staging . && docker push nangohq/$package --all-tags
    fi

    if [ "$ENV" == "prod" ]; then
        npm run ts-build && docker build -f packages/$PACKAGE_NAME/Dockerfile --platform linux/amd64 -t nangohq/$package:$(git rev-parse --short HEAD) -t nangohq/$package:production . && docker push nangohq/$package --all-tags
    fi
else
    # allow for custom worker cloud name
    if [ "$ENV" == "staging" ]; then
        npm run build:staging && docker buildx build --platform linux/amd64 -f packages/$PACKAGE_NAME/Dockerfile -t nangohq/nango-cloud-staging:$version -t nangohq/nango-cloud-staging:latest . --no-cache --output type=registry
    fi

    if [ "$ENV" == "prod" ]; then
        npm run build:prod && docker buildx build --platform linux/amd64 -f packages/$PACKAGE_NAME/Dockerfile -t nangohq/nango-cloud:$version -t nangohq/nango-cloud:latest . --no-cache --output type=registry
    fi

    if [ "$ENV" == "hosted" ]; then
        if [ "$tagLatest" == "true" ]; then
          npm run build:hosted && docker buildx build --platform linux/amd64 -f packages/$PACKAGE_NAME/Dockerfile -t nangohq/$package:$version -t nangohq/$package:latest . --no-cache --output type=registry
        else
          npm run build:hosted && docker buildx build --platform linux/amd64 -f packages/$PACKAGE_NAME/Dockerfile -t nangohq/$package:$version . --no-cache --output type=registry
        fi
    fi
fi
