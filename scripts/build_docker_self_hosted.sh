#!/usr/bin/env bash

set -e

GIT_HASH=$1
PUSH=$2

USAGE="./build_docker_self_hosted.sh GIT_HASH <push:boolean>"
RED='\033[0;31m'
NC='\033[0m'

if [ -z $GIT_HASH ]; then
  echo -e "${RED}GIT_HASH is empty${NC}"
  echo "$USAGE"
  exit
fi

# Move to here no matter where the file was executed
cd "$(dirname "$0")"

echo ""
echo -e "Building self-hosted nangohq/nango-server:hosted-$GIT_HASH"

VERSION=$(node -p "require('../package.json').version")

# Both platforms in one build: this image is three `rm -rf`s on top of
# nangohq/nango, so the emulated half costs nothing. A multi-platform result
# cannot be loaded into the local docker store, so it goes straight to the
# registry — or nowhere, when there is no credential to push with.
#
# `[ $PUSH ]` would have been true for the string "false" the workflow passes.
if [ "$PUSH" == 'true' ]; then
  out="--output=type=registry"
else
  out="--output=type=cacheonly"
fi

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --provenance=false \
  --build-arg BASE_IMAGE_HASH="$GIT_HASH" \
  --cache-from type=gha,scope=self-hosted \
  --cache-to type=gha,mode=max,scope=self-hosted \
  -t nangohq/nango-server:hosted \
  -t "nangohq/nango-server:hosted-$GIT_HASH" \
  -t "nangohq/nango-server:hosted-$VERSION" \
  --file ../Dockerfile.self_hosted \
  $out \
  ../
