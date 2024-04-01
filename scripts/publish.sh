#!/usr/bin/env bash

# exit when any command fails
set -e
set -x

# function to bump and publish a package
# $1: package name
# $2: package version
function bump_and_npm_publish {
    if npm view "$1@$2" >/dev/null 2>&1; then
        echo "Package '$1@$2' already exists"
    else
        echo "Publishing '$1@$2'"
        npm version "$2" -w "$1"
        npm publish --access public -w "$1"
    fi
}

GIT_ROOT_DIR=$(git rev-parse --show-toplevel)
VERSION=$1
BY_PASS_VERSION_CHECK=$2

# ensure version is of format x.y.z
if [[ "$BY_PASS_VERSION_CHECK" != "true" ]]; then
    # ensure version is of format x.y.z
    if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "VERSION '$VERSION' is not of format x.y.z"
        exit 1
    fi
fi

npm install

# Node client
bump_and_npm_publish "@nangohq/node" "$VERSION"
pushd "$GIT_ROOT_DIR/packages/shared"
npm install @nangohq/node@^$VERSION
popd

# Shared
bump_and_npm_publish "@nangohq/shared" "$VERSION"
# Update all packages to use the new shared version
package_dirs=("cli" "server" "runner" "jobs" "persist")
for dir in "${package_dirs[@]}"; do
    pushd "$GIT_ROOT_DIR/packages/$dir"
    npm install @nangohq/shared@^$VERSION
    popd
done

# CLI
bump_and_npm_publish "nango" "$VERSION"

# Frontend
bump_and_npm_publish "@nangohq/frontend" "$VERSION"
pushd "$GIT_ROOT_DIR/packages/webapp"
npm install @nangohq/frontend@^$VERSION
popd

# DEBUG: show changes in CI
git diff
