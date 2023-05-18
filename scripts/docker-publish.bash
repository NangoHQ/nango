#!/bin/bash

package=$1
version=$2

docker buildx build --platform linux/amd64 -f packages/$package/Dockerfile -t nangohq/$package:$2 -t nangohq/$package:latest . --no-cache --output type=registry

