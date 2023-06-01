#!/bin/bash

package=$1
version=$2
tagLatest=$3

PACKAGE_NAME=${package:6}

if [ "$tagLatest" == "true" ]; then
  docker buildx build --platform linux/amd64 -f packages/$PACKAGE_NAME/Dockerfile -t nangohq/$package:$version -t nangohq/$package:latest . --no-cache --output type=registry
else
  docker buildx build --platform linux/amd64 -f packages/$PACKAGE_NAME/Dockerfile -t nangohq/$package:$version . --no-cache --output type=registry
fi
