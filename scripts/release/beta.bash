#!/bin/bash

# Steps involved
# 1. Build all the packages
# 2. If any files changed in the shared package, build the webapp
#     - Use the updated shared version in server, worker, cli, node-client
# 3. Run a docker publish of the worker and the server
# 4. Bump the docker image version of both the worker and the server
# 5. Bump the cli version in the package.json and publish it
#
if [ $# -lt 2 ]
then
    echo "Usage: ./beta.bash [server_version] [worker_version]"
    exit 1
fi

# STEP 2
git update-index -q --refresh

# Check for modifications in the shared directory
if ! git diff-index --quiet HEAD -- ./packages/shared; then
    SHARED_PACKAGE_JSON="packages/shared/package.json"
    update_package_json_version $SHARED_PACKAGE_JSON
    update_shared_dep "packages/server/package.json" $(jq -r '.version' $SHARED_PACKAGE_JSON)
    update_shared_dep "packages/worker/package.json" $(jq -r '.version' $SHARED_PACKAGE_JSON)
    update_shared_dep "packages/cli/package.json" $(jq -r '.version' $SHARED_PACKAGE_JSON)
    update_shared_dep "packages/node-client/package.json" $(jq -r '.version' $SHARED_PACKAGE_JSON)
fi
exit 1

SERVER_VERSION=$1
WORKER_VERSION=$2
DOCKER_COMPOSE_FILE="packages/cli/docker/docker-compose.yaml"

# STEP 0
npm i
npm run ts-build
cd ./packages/webapp && npm run build && cd ../../

# STEP 1 -- run as background because it takes a while and it is non blocking
./scripts/release/docker-publish.bash nango-server $SERVER_VERSION-beta false &
./scripts/release/docker-publish.bash nango-worker $WORKER_VERSION-beta true &


SERVER_IMAGE="nangohq/nango-server"

# Worker image
WORKER_IMAGE="nangohq/nango-worker"

# STEP 2
# Replace the version for nango-server
sed -i "" "s|${SERVER_IMAGE}:[^ ]*|${SERVER_IMAGE}:${SERVER_VERSION}-beta|g" $DOCKER_COMPOSE_FILE

# Replace the version for nango-worker
sed -i "" "s|${WORKER_IMAGE}:[^ ]*|${WORKER_IMAGE}:${WORKER_VERSION}-beta|g" $DOCKER_COMPOSE_FILE

echo "nango-server and nango-worker published successfully and docker-compose in the cli was updated"

# STEP 3
CLI_PACKAGE_JSON="packages/cli/package.json"
update_package_json_version $CLI_PACKAGE_JSON

cd ./packages/cli && npm publish --tag beta --access public && cd ../../

function update_shared_dep() {
    PACKAGE_JSON=$1
    NEW_VERSION=$2

    # Update the version in the JSON file
    jq --arg NEW_VERSION "$NEW_VERSION" '.dependencies["@nangohq/shared"] = $NEW_VERSION' $PACKAGE_JSON | sponge $PACKAGE_JSON
}

function update_package_json_version() {
    PACKAGE_JSON=$1

    VERSION=$(jq -r '.version' $PACKAGE_JSON)

    # Remove '-beta' from the version
    BASE_VERSION=${VERSION%-beta}

    # Split the version into its parts
    IFS='.' read -ra VERSION_PARTS <<< "$BASE_VERSION"

    # Get the last part of the version
    LAST_PART=${VERSION_PARTS[${#VERSION_PARTS[@]}-1]}

    # Increment the last part by 1
    NEW_LAST_PART=$((LAST_PART + 1))

    # Replace the last part in the version
    NEW_VERSION="${VERSION_PARTS[0]}.${VERSION_PARTS[1]}.$NEW_LAST_PART"

    # Add '-beta' back to the version
    NEW_VERSION="${NEW_VERSION}-beta"

    # Update the version in the JSON file
    jq --arg NEW_VERSION "$NEW_VERSION" '.version = $NEW_VERSION' $PACKAGE_JSON | sponge $PACKAGE_JSON

    echo "$PACKAGE_JSON version bumped successfully!"
}
