#!/bin/bash

if [ $# -lt 2 ]
then
    echo "Usage: ./release.bash [server_and_worker_version] [prod|staging|hosted] [optional_specific_version]"
    exit 1
fi

function update_shared_dep() {
    PACKAGE_JSON=$1
    NEW_VERSION=$2

    jq --arg NEW_VERSION "$NEW_VERSION" '.dependencies["@nangohq/shared"] = $NEW_VERSION' --indent 4 $PACKAGE_JSON | sponge $PACKAGE_JSON
}

function update_node_dep() {
    PACKAGE_JSON=$1
    NEW_VERSION=$2

    jq --arg NEW_VERSION "$NEW_VERSION" '.dependencies["@nangohq/node"] = $NEW_VERSION' --indent 4 $PACKAGE_JSON | sponge $PACKAGE_JSON
}

function update_frontend_dep() {
    PACKAGE_JSON=$1
    NEW_VERSION=$2

    jq --arg NEW_VERSION "$NEW_VERSION" '.dependencies["@nangohq/frontend"] = $NEW_VERSION' --indent 4 $PACKAGE_JSON | sponge $PACKAGE_JSON
}

function update_package_json_version() {
    PACKAGE_JSON=$1
    SPECIFIC_VERSION=$2

    if [ -z "$SPECIFIC_VERSION" ]; then
        VERSION=$(jq -r '.version' $PACKAGE_JSON)

        IFS='.' read -ra VERSION_PARTS <<< "$VERSION"

        LAST_PART=${VERSION_PARTS[${#VERSION_PARTS[@]}-1]}

        NEW_LAST_PART=$((LAST_PART + 1))

        NEW_VERSION="${VERSION_PARTS[0]}.${VERSION_PARTS[1]}.$NEW_LAST_PART"
    else
        NEW_VERSION=$SPECIFIC_VERSION
    fi

    jq --arg NEW_VERSION "$NEW_VERSION" '.version = $NEW_VERSION' --indent 4 $PACKAGE_JSON | sponge $PACKAGE_JSON

    echo "$PACKAGE_JSON version bumped successfully!"
}

# node client is the first to be published since shared depends on it
NODE_CLIENT_PACKAGE_JSON="packages/node-client/package.json"
update_package_json_version $NODE_CLIENT_PACKAGE_JSON $3
npm i
npm run ts-build
cd ./packages/node-client && npm publish --access public && cd ../../

# update the shared package that depends on the node client
update_shared_dep "packages/shared/package.json" $(jq -r '.version' $NODE_CLIENT_PACKAGE_JSON)

# Update the shared package and then bump the cli, server and worker versions that depend on it
SHARED_PACKAGE_JSON="packages/shared/package.json"
update_package_json_version $SHARED_PACKAGE_JSON $3

rm -rf packages/shared/dist
npm run ts-build
cd ./packages/shared && npm publish --access public && cd ../../

update_shared_dep "packages/server/package.json" $(jq -r '.version' $SHARED_PACKAGE_JSON)
update_shared_dep "packages/worker/package.json" $(jq -r '.version' $SHARED_PACKAGE_JSON)
update_shared_dep "packages/cli/package.json" $(jq -r '.version' $SHARED_PACKAGE_JSON)

# update the webapp and frontend
FRONTEND_PACKAGE_JSON="packages/frontend/package.json"
update_package_json_version $FRONTEND_PACKAGE_JSON $3
cd ./packages/frontend && npm publish --access public && cd ../../

update_frontend_dep "packages/webapp/package.json" $(jq -r '.version' $FRONTEND_PACKAGE_JSON)

WEBAPP_PACKAGE_JSON="packages/webapp/package.json"
npm i
update_package_json_version $WEBAPP_PACKAGE_JSON $3

SERVER_WORKER_VERSION=$1
ENV=$2
DOCKER_COMPOSE_FILE="packages/cli/docker/docker-compose.yaml"

npm i
npm run ts-build
cd ./packages/webapp && npm run build && cd ../../

WORKER_PACKAGE_JSON="packages/worker/package.json"
SERVER_PACKAGE_JSON="packages/server/package.json"
update_package_json_version $SERVER_PACKAGE_JSON $3
update_package_json_version $WORKER_PACKAGE_JSON $3

update_node_dep "packages/worker/package.json" $(jq -r '.version' $NODE_CLIENT_PACKAGE_JSON)

rm -rf ./packages/webapp/build/fonts
./scripts/docker-publish.bash nango-server $SERVER_WORKER_VERSION true $2
rm -rf ./packages/webapp/build/fonts
./scripts/docker-publish.bash nango-server $SERVER_WORKER_VERSION true hosted
rm -rf ./packages/webapp/build/fonts
./scripts/docker-publish.bash nango-worker $SERVER_WORKER_VERSION true hosted


SERVER_IMAGE="nangohq/nango-server"
WORKER_IMAGE="nangohq/nango-worker"

sed -i "" "s|${SERVER_IMAGE}:[^ ]*|${SERVER_IMAGE}:${SERVER_WORKER_VERSION}|g" $DOCKER_COMPOSE_FILE
sed -i "" "s|${WORKER_IMAGE}:[^ ]*|${WORKER_IMAGE}:${SERVER_WORKER_VERSION}|g" $DOCKER_COMPOSE_FILE

echo "nango-server and nango-worker published successfully and docker-compose in the cli was updated"

CLI_PACKAGE_JSON="packages/cli/package.json"
update_package_json_version $CLI_PACKAGE_JSON $3

# so that the cli can export the NangoSync type
cp ./packages/shared/dist/lib/sdk/sync.d.ts ./packages/cli/dist/nango-sync.d.ts

cd ./packages/cli && npm publish --access public && cd ../../
npm i
