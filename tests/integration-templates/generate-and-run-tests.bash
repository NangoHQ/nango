#!/bin/bash
pushd () {
    command pushd "$@" > /dev/null
}

popd () {
    command popd "$@" > /dev/null
}

INTEGRATION=$1

if [ ! -d "../../integration-templates/$INTEGRATION/mocks" ]; then
    echo "No mocks found for $INTEGRATION"
    exit 0
fi

mkdir -p nango-integrations
pushd nango-integrations
cp -r ../../../integration-templates/$INTEGRATION .
mv $INTEGRATION/nango.yaml .
npx nango generate
npm run generate
npm run test
popd
rm -rf nango-integrations
