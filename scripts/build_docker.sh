#!/usr/bin/env bash

set -e

ACTION=$1
GIT_HASH=$2

USAGE="./build_docker.sh <build|push> GIT_HASH"
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
echo -e "Building nangohq/nango\n"

docker buildx build \
  --platform linux/amd64 \
  --build-arg git_hash="$GIT_HASH" \
  --cache-from type=gha \
  --cache-to type=gha,mode=max \
  --file ../Dockerfile \
  $tags \
  ../
