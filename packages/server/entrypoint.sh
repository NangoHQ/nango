#!/usr/bin/env bash

set -ex

dir=$(pwd)

echo "$dir/packages/server/dist/server.js"

# https://docs.docker.com/engine/containers/multi-service_container/

# connect ui
if [ "$FLAG_SERVE_CONNECT_UI" == "true" ]; then
  # Connect UI is loaded in an iframe, so it must not be served with a framing restriction. `serve`
  # sets none itself, but a reverse proxy or CDN in front may add `X-Frame-Options`, which then wins
  # by default. Emitting `frame-ancestors` overrides it: per CSP, browsers ignore `X-Frame-Options`
  # when that directive is present. `serve` reads this file automatically, and `--single` is applied
  # on top of it, so the SPA fallback is unaffected.
  if [ -n "$NANGO_CONNECT_UI_FRAME_ANCESTORS" ]; then
    cat > "$dir/packages/connect-ui/dist/serve.json" <<JSON
{
  "headers": [
    {
      "source": "**/*",
      "headers": [
        { "key": "Content-Security-Policy", "value": "frame-ancestors $NANGO_CONNECT_UI_FRAME_ANCESTORS" }
      ]
    }
  ]
}
JSON
  fi

  node "$dir/packages/server/dist/server.js" &

  # This is not recommended, you should serve Connect UI from a dedicated static website hosting
  npm run -w @nangohq/connect-ui serve:unsafe &

  # Wait for any process to exit
  wait -n

  # Exit with status of process that exited first
  exit $?
else
  node "$dir/packages/server/dist/server.js"
fi
