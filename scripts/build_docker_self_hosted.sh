#!/usr/bin/env bash

set -e

ACTION=$1
GIT_HASH=$2

USAGE="./build_docker_self_hosted.sh <build|push> GIT_HASH"
RED='\033[0;31m'
NC='\033[0m'

if [ "$ACTION" != "push" ] && [ "$ACTION" != "build" ]; then
  echo -e "${RED}Please specify an action${NC}\n"
  echo "$USAGE"
  exit
fi

if [ -z $GIT_HASH ]; then
  echo -e "${RED}GIT_HASH is empty${NC}"
  exit
fi

# Move to here no matter where the file was executed
cd "$(dirname "$0")"

tags="-t nangohq/nango:${GIT_HASH}"

if [ $ACTION == 'build' ]; then
  tags+=" --output=type=docker"
else
  tags+=" --output=type=registry"
fi

echo ""
echo -e "Building self-hosted nangohq/nango-server:hosted-$GIT_HASH"

VERSION=$(node -p "require('../package.json').version")

docker buildx build \
  --platform linux/amd64 \
  --build-arg BASE_IMAGE_HASH="$GIT_HASH" \
  --cache-from type=gha \
  --cache-to type=gha,mode=max \
  -t nangohq/nango-server:hosted \
  -t "nangohq/nango-server:hosted-$GIT_HASH" \
  -t "nangohq/nango-server:hosted-$VERSION" \
  --file ../Dockerfile.self_hosted \
  $tags \
  ../
