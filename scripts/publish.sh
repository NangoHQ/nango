#!/usr/bin/env bash

# exit when any command fails
set -e
set -x

# function to bump and publish a package
# $1: package name
# $2: package version
function bump_and_npm_publish {
    echo
    echo "Publishing '$1@$2'"
    if npm view "$1@$2" >/dev/null 2>&1; then
        echo "Package '$1@$2' already exists"
    else
        npm version "$2" -w "$1"
        npm publish --access public -w "$1"
    fi
    echo
}

function bump_other_pkg {
    folder=$1
    package=$2
    pushd "$GIT_ROOT_DIR/packages/$folder"
    npm install --save --save-exact @nangohq/$package@$VERSION
    popd
}

GIT_ROOT_DIR=$(git rev-parse --show-toplevel)
VERSION=$1

# ensure version is of format x.y.z or 0.0.1-<commit hash>
if [[ ! "$VERSION" =~ ^([0-9]+\.[0-9]+\.[0-9]+|0\.0\.1-[0-9a-fA-F]{40})$ ]]; then
    echo "VERSION '$VERSION' is not of format x.y.z or 0.0.1-<commit hash>"
    exit 1
fi

# increment stored version
# NB: macos and linux have different "sed" that don't edit in place the same way
pushd "$GIT_ROOT_DIR/packages"
sed -E "s/NANGO_VERSION = '[0-9a-fA-F.-]+/NANGO_VERSION = '$VERSION/" ./shared/lib/version.ts >tmp
mv tmp ./shared/lib/version.ts
sed -E "s/NANGO_VERSION = '[0-9a-fA-F.-]+/NANGO_VERSION = '$VERSION/" ./node-client/lib/version.ts >tmp
mv tmp ./node-client/lib/version.ts
sed -E "s/NANGO_VERSION = '[0-9a-fA-F.-]+/NANGO_VERSION = '$VERSION/" ./cli/lib/version.ts >tmp
mv tmp ./cli/lib/version.ts
popd

# build codebase
npm ci
npm run ts-build

# Types
bump_and_npm_publish "@nangohq/types" "$VERSION"
bump_other_pkg "cli" "types"
bump_other_pkg "frontend" "types"
bump_other_pkg "nango-yaml" "types"
bump_other_pkg "node-client" "types"
bump_other_pkg "runner-sdk" "types"
bump_other_pkg "providers" "types"

# NangoYaml
bump_and_npm_publish "@nangohq/nango-yaml" "$VERSION"
bump_other_pkg "cli" "nango-yaml"

# Providers
bump_and_npm_publish "@nangohq/providers" "$VERSION"
bump_other_pkg "runner-sdk" "providers"

# Providers
bump_and_npm_publish "@nangohq/providers" "$VERSION"
bump_other_pkg "runner-sdk" "providers"
bump_other_pkg "shared" "providers"

# Node client
bump_and_npm_publish "@nangohq/node" "$VERSION"
bump_other_pkg "runner-sdk" "node"
bump_other_pkg "cli" "node"

# Runner SDK
bump_and_npm_publish "@nangohq/runner-sdk" "$VERSION"
bump_other_pkg "cli" "runner-sdk"

# CLI
bump_and_npm_publish "nango" "$VERSION"

# Frontend
bump_and_npm_publish "@nangohq/frontend" "$VERSION"
pushd "$GIT_ROOT_DIR/packages/webapp"
npm install --save --save-exact @nangohq/frontend@$VERSION
popd

jq ".version = \"$VERSION\"" package.json >temp.json && mv temp.json package.json
npm i

# DEBUG: show changes in CI
git diff --name-only
git diff
