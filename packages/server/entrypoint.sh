#!/usr/bin/env bash

set -e

# https://docs.docker.com/engine/containers/multi-service_container/

# server

# connect ui
if [ "$FLAG_SERVE_CONNECT_UI" == "true" ]; then
  node packages/server/dist/server.js &

  # This is not recommended, you should server UI from a dedicated static website hosting
  npm run -w @nangohq/connect-ui prod:unsafe &
else
  node packages/server/dist/server.js
fi

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?
