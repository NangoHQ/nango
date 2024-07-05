#!/bin/bash

INTEGRATION=$1
shift

cd integration-templates/$INTEGRATION

# grab the value from the .env file for NANGO_SECRET_KEY_DEV
NANGO_SECRET_KEY_DEV=$(grep NANGO_SECRET_KEY_DEV .env | cut -d '=' -f2)

NANGO_SECRET_KEY_DEV=$NANGO_SECRET_KEY_DEV NANGO_HOSTPORT=http://localhost:3003 _NANGO_IN_REPO=true npx nango compile
cp models.ts ../
NANGO_SECRET_KEY_DEV=$NANGO_SECRET_KEY_DEV NANGO_HOSTPORT=http://localhost:3003 _NANGO_IN_REPO=true npx nango $@
rm ../models.ts
