#!/usr/bin/env bash

set -xe

ENV=$1 # enterprise | hosted | prod | staging
GIT_HASH=$2
POSTHOG_KEY=$3
SENTRY_KEY=$4

USAGE="./build_docker.sh <enterprise | hosted | prod | staging> GIT_HASH POSTHOG_KEY SENTRY_KEY"

if [ "$ENV" != "enterprise" ] && [ "$ENV" != "hosted" ] && [ "$ENV" != "prod" ] && [ "$ENV" != "staging" ]; then
  echo "$USAGE"
  exit
fi

# Move to here no matter where the file was executed
cd "$(dirname "$0")"

tags="-t nango:latest -t nango:${ENV}"
if [ $GIT_HASH ]; then
  tags+=" -t nango:${ENV}-${GIT_HASH} -t nango:${GIT_HASH}"
fi

docker build \
  ${tags} \
  --file ../Dockerfile \
  --build-arg image_env=${ENV} \
  --build-arg git_hash=${GIT_HASH} \
  --build-arg posthog_key=${SENTRY_KEY} \
  --build-arg sentry_key=${POSTHOG_KEY} \
  ../
