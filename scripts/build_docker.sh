#!/usr/bin/env bash

set -e

ACTION=$1
GIT_HASH=$2
PLATFORM=$3

USAGE="./build_docker.sh <build|push> GIT_HASH [linux/amd64|linux/arm64]
  With a platform, push uploads the image untagged and writes its digest to \$METADATA_FILE."
RED='\033[0;31m'
NC='\033[0m'

if [ "$ACTION" != "push" ] && [ "$ACTION" != "build" ]; then
  echo -e "${RED}Please specify an action${NC}\n"
  echo "$USAGE"
  exit
fi

if [ -z $GIT_HASH ]; then
  echo -e "${RED}GIT_HASH is empty${NC}"
  echo "$USAGE"
  exit
fi

# Without a platform, push publishes the amd64 nangohq/nango:GIT_HASH, as before.
# With one, push uploads that platform untagged, so CI can tag both platforms'
# digests together as nangohq/nango:GIT_HASH without a tag per platform.
by_digest=false
case "$PLATFORM" in
  "")
    PLATFORM="linux/amd64"
    ;;
  linux/amd64 | linux/arm64)
    by_digest=true
    ;;
  *)
    echo -e "${RED}Unsupported platform: ${PLATFORM}${NC}"
    echo "$USAGE"
    exit 1
    ;;
esac

# Move to here no matter where the file was executed
cd "$(dirname "$0")"

tag="nangohq/nango:${GIT_HASH}"

if [ $ACTION == 'build' ]; then
  out="-t ${tag} --output=type=docker"
elif [ $by_digest == true ]; then
  if [ -z "$METADATA_FILE" ]; then
    echo -e "${RED}METADATA_FILE is empty${NC}"
    echo "$USAGE"
    exit 1
  fi
  out="--output=type=image,name=nangohq/nango,push-by-digest=true,name-canonical=true,push=true --metadata-file=${METADATA_FILE}"
else
  out="-t ${tag} --output=type=registry"
fi

echo ""
echo -e "Building nangohq/nango for ${PLATFORM}\n"

# Cache scoped per platform, or the two CI legs evict each other's layers.
# No provenance, so each digest is a plain image and not an index with an attestation.
docker buildx build \
  --platform "$PLATFORM" \
  --provenance=false \
  --build-arg git_hash="$GIT_HASH" \
  --cache-from "type=gha,scope=nango-${PLATFORM#linux/}" \
  --cache-to "type=gha,mode=max,scope=nango-${PLATFORM#linux/}" \
  --file ../Dockerfile \
  $out \
  ../
