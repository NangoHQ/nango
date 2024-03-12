#!/usr/bin/env bash

set -e

ACTION=$1
ENV=$2 # enterprise | hosted | prod | staging
GIT_HASH=$3

USAGE="./build_docker.sh <build|push> <enterprise | hosted | prod | staging> GIT_HASH"
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

if [ "$ACTION" != "push" ] && [ "$ACTION" != "build" ]; then
  echo -e "${RED}Please specify an action${NC}\n"
  echo "$USAGE"
  exit
fi

if [ "$ENV" != "enterprise" ] && [ "$ENV" != "hosted" ] && [ "$ENV" != "prod" ] && [ "$ENV" != "staging" ]; then
  echo -e "${RED}Please specify an environment${NC}\n"
  echo "$USAGE"
  exit
fi

if [ -z $GIT_HASH ]; then
  echo -e "${RED}GIT_HASH is empty${NC}"
  exit
fi

if [ -z $SENTRY_KEY ]; then
  echo -e "${YELLOW}SENTRY_KEY is empty${NC}"
fi
if [ -z $POSTHOG_KEY ]; then
  echo -e "${YELLOW}POSTHOG_KEY is empty${NC}"
fi

# Move to here no matter where the file was executed
cd "$(dirname "$0")"

tags="-t nangohq/nango:${ENV}-${GIT_HASH}"

if [ $ACTION == 'build' ]; then
  tags+=" --output=type=docker"
else
  tags+=" --output=type=registry"
fi

echo ""
echo -e "Building nangohq/nango:${ENV}\n"

docker buildx build \
  --platform linux/amd64 \
  --build-arg image_env=${ENV} \
  --build-arg git_hash=${GIT_HASH} \
  --build-arg posthog_key=${SENTRY_KEY} \
  --build-arg sentry_key=${POSTHOG_KEY} \
  --cache-from type=gha \
  --cache-to type=gha,mode=max \
  --file ../Dockerfile \
  $tags \
  ../
