#!/usr/bin/env bash

set -ex

dir=$(pwd)

echo "$dir/packages/server/dist/server.js"

# https://docs.docker.com/engine/containers/multi-service_container/

# connect ui
if [ "$FLAG_SERVE_CONNECT_UI" == "true" ]; then
  node "$dir/packages/server/dist/server.js" &

  # This is not recommended, you should serve Connect UI from a dedicated static website hosting
  "$dir/node_modules/.bin/serve" -s "$dir/packages/connect-ui/dist" -p "${NANGO_CONNECT_UI_PORT:-3009}" &

  # Wait for any process to exit
  wait -n

  # Exit with status of process that exited first
  exit $?
else
  node "$dir/packages/server/dist/server.js"
fi
