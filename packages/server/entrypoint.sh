#!/usr/bin/env bash

set -ex

dir=$(pwd)

echo "$dir/packages/server/dist/server.js"

# https://docs.docker.com/engine/containers/multi-service_container/

# connect ui
if [ "$FLAG_SERVE_CONNECT_UI" == "true" ]; then
  node "$dir/packages/server/dist/server.js" &

  # Rewrite Connect UI's placeholder base path to the one this deployment serves it under (derived
  # from NANGO_PUBLIC_CONNECT_URL, or NANGO_CONNECT_UI_BASE_PATH; defaults to "/"), so it can be
  # hosted under a non-root path. Rewrites to "/" for root deployments.
  npm run -w @nangohq/connect-ui set-base-path

  # This is not recommended, you should serve Connect UI from a dedicated static website hosting
  npm run -w @nangohq/connect-ui serve:unsafe &

  # Wait for any process to exit
  wait -n

  # Exit with status of process that exited first
  exit $?
else
  node "$dir/packages/server/dist/server.js"
fi
