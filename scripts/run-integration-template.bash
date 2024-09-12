#!/bin/bash

pushd () {
    command pushd "$@" > /dev/null
}

popd () {
    command popd "$@" > /dev/null
}

TEMP_DIRECTORY=tmp-run-integration-template

NANGO_SECRET_KEY_DEV_DEFAULT=$(grep -v '^#' .env | grep NANGO_SECRET_KEY_DEV | cut -d '=' -f2)
NANGO_HOSTPORT_DEFAULT=http://localhost:3003

# optional arguments
for arg in "$@"; do
    case $arg in
        KEY=*)
            NANGO_SECRET_KEY_DEV="${arg#*=}"
            shift
            ;;
        HOST=*)
            NANGO_HOSTPORT="${arg#*=}"
            shift
            ;;
    esac
done

# Fallback to default values if not set by arguments
NANGO_SECRET_KEY_DEV=${NANGO_SECRET_KEY_DEV:-$NANGO_SECRET_KEY_DEV_DEFAULT}
NANGO_HOSTPORT=${NANGO_HOSTPORT:-$NANGO_HOSTPORT_DEFAULT}

INTEGRATION=$1
shift

rm -rf $TEMP_DIRECTORY
mkdir -p $TEMP_DIRECTORY/nango-integrations
cp -r integration-templates/$INTEGRATION $TEMP_DIRECTORY/nango-integrations

mv $TEMP_DIRECTORY/nango-integrations/$INTEGRATION/nango.yaml $TEMP_DIRECTORY/nango-integrations/nango.yaml
[ -f $TEMP_DIRECTORY/nango-integrations/*.ts ] && mv $TEMP_DIRECTORY/nango-integrations/*.ts $TEMP_DIRECTORY/nango-integrations/$INTEGRATION/

pushd $TEMP_DIRECTORY/nango-integrations

NANGO_MOCKS_RESPONSE_DIRECTORY="../../integration-templates/" NANGO_SECRET_KEY_DEV=$NANGO_SECRET_KEY_DEV NANGO_HOSTPORT=$NANGO_HOSTPORT npx nango "$@"
popd
rm -rf $TEMP_DIRECTORY
