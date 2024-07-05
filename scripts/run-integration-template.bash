#!/bin/bash
#

pushd () {
    command pushd "$@" > /dev/null
}

popd () {
    command popd "$@" > /dev/null
}

INTEGRATION=$1
shift

NANGO_SECRET_KEY_DEV=$(grep NANGO_SECRET_KEY_DEV .env | cut -d '=' -f2)

rm -rf temp
mkdir -p temp/nango-integrations
cp -r integration-templates/$INTEGRATION temp/nango-integrations

mv temp/nango-integrations/$INTEGRATION/nango.yaml temp/nango-integrations/nango.yaml

pushd temp/nango-integrations

NANGO_SECRET_KEY_DEV=$NANGO_SECRET_KEY_DEV NANGO_HOSTPORT=http://localhost:3003 npx nango $@
popd
rm -rf temp
