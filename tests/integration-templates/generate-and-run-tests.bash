#!/bin/bash
pushd () {
    command pushd "$@" > /dev/null
}

popd () {
    command popd "$@" > /dev/null
}

INTEGRATION=$1

mkdir -p nango-integrations
pushd nango-integrations
cp -r ../../../integration-templates/$INTEGRATION .
mv $INTEGRATION/nango.yaml .
npx nango generate
npm run generate
pushd ../tests
popd
npm run test
popd
rm -rf nango-integrations
