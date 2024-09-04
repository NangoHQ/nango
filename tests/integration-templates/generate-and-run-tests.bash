#!/bin/bash
pushd () {
    command pushd "$@" > /dev/null
}

popd () {
    command popd "$@" > /dev/null
}

INTEGRATION=$1

# if no mocks exist for this integration then bail early
if [ ! -d "../../integration-templates/$INTEGRATION/mocks" ]; then
    pwd
    echo "No mocks found for $INTEGRATION"
    exit 0
fi

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
