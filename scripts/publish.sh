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

function vendor {
    pushd "$GIT_ROOT_DIR/packages/$1"
    jq '.bundleDependencies = true' package.json >temp.json && mv temp.json package.json
    npm install --workspaces=false
    npm run build
    npm pack --pack-destination "$GIT_ROOT_DIR/packages/shared/vendor"
    popd
}

GIT_ROOT_DIR=$(git rev-parse --show-toplevel)
VERSION=$1

# ensure version is of format x.y.z or 0.0.1-<commit hash>
if [[ ! "$VERSION" =~ ^([0-9]+\.[0-9]+\.[0-9]+|0\.0\.1-[0-9a-fA-F]{40})$ ]]; then
    echo "VERSION '$VERSION' is not of format x.y.z or 0.0.1-<commit hash>"
    exit 1
fi

npm ci

# pack utils and install it in shared
mkdir -p "$GIT_ROOT_DIR/packages/shared/vendor"
vendor "utils"
vendor "logs"

pushd "$GIT_ROOT_DIR/packages/shared"
npm install "@nangohq/utils@file:vendor/nangohq-utils-1.0.0.tgz" --workspaces=false
npm install "@nangohq/logs@file:vendor/nangohq-logs-1.0.0.tgz" --workspaces=false
popd

# Node client
bump_and_npm_publish "@nangohq/node" "$VERSION"
pushd "$GIT_ROOT_DIR/packages/shared"
npm install @nangohq/node@^$VERSION
popd

# Shared
npm run build -w @nangohq/records # records is required to build shared
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
