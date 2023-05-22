#!/bin/bash

package=$1
version=$2

PACKAGE_NAME=${package:6}

docker buildx build --platform linux/amd64 -f packages/$PACKAGE_NAME/Dockerfile -t nangohq/$package:$2 -t nangohq/$package:latest . --no-cache --output type=registry

