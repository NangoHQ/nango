#!/usr/bin/env bash

set -e

GIT_HASH=$1
PUSH=$2
PLATFORMS=${3:-linux/amd64}

USAGE="./build_docker_self_hosted.sh GIT_HASH <push:boolean> [PLATFORMS]"
RED='\033[0;31m'
NC='\033[0m'

if [ -z $GIT_HASH ]; then
  echo -e "${RED}GIT_HASH is empty${NC}"
  echo "$USAGE"
  exit
fi

case "$PLATFORMS" in
  linux/amd64 | linux/arm64 | linux/amd64,linux/arm64 | linux/arm64,linux/amd64) ;;
  *)
    echo -e "${RED}Unsupported platforms: ${PLATFORMS}${NC}"
    echo "$USAGE"
    exit 1
    ;;
esac

# Move to here no matter where the file was executed
cd "$(dirname "$0")"

echo ""
echo -e "Building self-hosted nangohq/nango-server:hosted-$GIT_HASH"

VERSION=$(node -p "require('../package.json').version")

# A multi-platform build can't be loaded into the local image store, so it is
# pushed straight to the registry. Without push, build one platform and load it.
if [ "$PUSH" == 'true' ]; then
  out="--push"
else
  if [[ "$PLATFORMS" == *,* ]]; then
    echo "Not pushing, so building only ${PLATFORMS%%,*} of ${PLATFORMS}"
    PLATFORMS=${PLATFORMS%%,*}
  fi
  out="--load"
fi

docker buildx build \
  --platform "$PLATFORMS" \
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
