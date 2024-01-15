#!/usr/bin/env bash

# exit when any command fails
set -e

# function to bump and publish a package
# $1: package name
# $2: package version
function bump_and_npm_publish {
    if npm view "$1@$2" > /dev/null 2>&1; then
        echo "Package '$1@$2' already exists"
    else
        echo "Publishing '$1@$2'"
        npm version "$2" -w "$1"
        npm publish --access public -w "$1"
    fi
}

GIT_ROOT_DIR=$(git rev-parse --show-toplevel)
VERSION=$1

# ensure version is of format x.y.z
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "VERSION '$VERSION' is not of format x.y.z"
  exit 1
fi

npm install

# Node client
bump_and_npm_publish "@nangohq/node" "$VERSION"
npm install "@nangohq/node@$VERSION" -w @nangohq/shared

# Shared
node scripts/flows.js
bump_and_npm_publish "@nangohq/shared" "$VERSION"
npm install "@nangohq/shared@$VERSION" -w nango -w @nangohq/nango-server -w @nangohq/nango-jobs -w @nangohq/nango-runner

# CLI
bump_and_npm_publish "nango" "$VERSION"

# Frontend
bump_and_npm_publish "@nangohq/frontend" "$VERSION"
