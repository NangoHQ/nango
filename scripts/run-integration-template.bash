#!/bin/bash
#

pushd () {
    command pushd "$@" > /dev/null
}

popd () {
    command popd "$@" > /dev/null
}

TEMP_DIRECTORY=tmp-run-integration-template
INTEGRATION=$1
shift

NANGO_SECRET_KEY_DEV=$(grep -v '^#' .env | grep NANGO_SECRET_KEY_DEV | cut -d '=' -f2)

rm -rf $TEMP_DIRECTORY
mkdir -p $TEMP_DIRECTORY/nango-integrations
cp -r integration-templates/$INTEGRATION $TEMP_DIRECTORY/nango-integrations

mv $TEMP_DIRECTORY/nango-integrations/$INTEGRATION/nango.yaml $TEMP_DIRECTORY/nango-integrations/nango.yaml
[ -d $TEMP_DIRECTORY/nango-integrations/$INTEGRATION/fixtures ] && mv $TEMP_DIRECTORY/nango-integrations/$INTEGRATION/fixtures $TEMP_DIRECTORY/nango-integrations/fixtures

pushd $TEMP_DIRECTORY/nango-integrations

NANGO_SECRET_KEY_DEV=$NANGO_SECRET_KEY_DEV NANGO_HOSTPORT=http://localhost:3003 npx nango $@
popd
rm -rf $TEMP_DIRECTORY
