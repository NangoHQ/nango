#!/usr/bin/env bash

set -e

ACTION=$1
GIT_HASH=$2
PLATFORM=${3:-linux/amd64}

USAGE="./build_docker.sh <build|push> GIT_HASH [PLATFORM]"
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

# Move to here no matter where the file was executed
cd "$(dirname "$0")"

# One platform per call, so CI can build each on a runner of that architecture
# rather than emulating one of them. `push` publishes an untagged per-platform
# manifest and records its digest in metadata.json; the workflow merges the two
# digests into the single `nangohq/nango:$GIT_HASH` tag afterwards.
if [ $ACTION == 'build' ]; then
  out="-t nangohq/nango:${GIT_HASH} --output=type=docker"
else
  out="--output=type=image,name=nangohq/nango,push-by-digest=true,name-canonical=true,push=true --metadata-file=metadata.json"
fi

# Scoped per platform: the two builds share one Actions cache, and unscoped they
# would each evict the other's layers on every run.
scope="${PLATFORM//\//-}"

echo ""
echo -e "Building nangohq/nango for ${PLATFORM}\n"

# --provenance=false, as in the other image builds: attestations would add an
# `unknown/unknown` entry beside the two real platforms in the published manifest.
docker buildx build \
  --platform "$PLATFORM" \
  --provenance=false \
  --build-arg git_hash="$GIT_HASH" \
  --cache-from "type=gha,scope=$scope" \
  --cache-to "type=gha,mode=max,scope=$scope" \
  --file ../Dockerfile \
  $out \
  ../
