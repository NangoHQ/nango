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

docker buildx build \
  --platform linux/amd64 \
  --build-arg BASE_IMAGE_HASH="$GIT_HASH" \
  --cache-from type=gha \
  --cache-to type=gha,mode=max \
  -t nangohq/nango-server:hosted \
  -t "nangohq/nango-server:hosted-$GIT_HASH" \
  -t "nangohq/nango-server:hosted-$VERSION" \
  --file ../Dockerfile.self_hosted \
  --output=type=docker \
  ../

if [ $PUSH ]; then
  echo "Pushing"
  docker push nangohq/nango-server:hosted
  docker push "nangohq/nango-server:hosted-$GIT_HASH"
  docker push "nangohq/nango-server:hosted-$VERSION"
else
  echo "Not pushing"
fi
