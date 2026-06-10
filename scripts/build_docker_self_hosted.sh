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

SELF_HOSTED_IMAGE="ghcr.io/usehivy/integrations:latest"

echo ""
echo -e "Building self-hosted $SELF_HOSTED_IMAGE"

output="type=docker"

if [ "$PUSH" = "true" ]; then
  output="type=registry"
fi

docker buildx build \
  --platform linux/amd64 \
  --build-arg git_hash="$GIT_HASH" \
  --target self-hosted \
  --cache-from type=gha \
  --cache-to type=gha,mode=max \
  -t "$SELF_HOSTED_IMAGE" \
  --file ../Dockerfile \
  --output="$output" \
  ../

if [ "$PUSH" = "true" ]; then
  echo "Pushed"
else
  echo "Not pushing"
fi
