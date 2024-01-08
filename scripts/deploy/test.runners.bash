#!/bin/bash

# Available Environment Variables
# ENVIRONMENT
# API_KEY
# RUNNER_OWNER_ID

ENVIRONMENT=production

CURSOR=""

while true; do
  response=$(cat)

  CURSOR=$(echo "$response" | jq -r 'last.cursor')

  if [ -z "$CURSOR" ]; then
    break
  fi

  echo "$response" | jq -c '.[]' | while read -r item; do
    name=$(echo "$item" | jq -r '.service.name')
    if [[ "$name" != "$ENVIRONMENT-runner-"* ]]; then
      continue
    fi
    serviceId=$(echo "$item" | jq -r '.service.id')
    echo "Deploying service with ID: $serviceId"

    sleep 1
  done
done

