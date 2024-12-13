#!/bin/bash

# Available Environment Variables
# ENVIRONMENT
# API_KEY
# RUNNER_OWNER_ID

CURSOR=""
LIMIT=50

# keep a count of how many times we've tried to deploy
COUNTER=0

while true; do
  response=$(curl -s --request GET \
     --url "https://api.render.com/v1/services?suspended=not_suspended&limit=$LIMIT&ownerId=$RUNNER_OWNER_ID&cursor=$CURSOR&env=image&type=private_service" \
     --header "accept: application/json" \
     --header "authorization: Bearer $API_KEY")

  if [ "$response" == "[]" ]; then
    break
  fi

  parsed_response=$(echo "$response" | jq -c '.[]' 2>/dev/null)
  CURSOR=$(echo "$response" | jq -r '.[-1].cursor' 2>/dev/null)

  while IFS= read -r item; do
    if [ -z "$item" ]; then
      continue
    fi
    name=$(echo "$item" | jq -r '.service.name' 2>/dev/null)
    if [[ ! "$name" =~ ^$ENVIRONMENT-runner-account-(default|[0-9]+)$ ]]; then
      continue
    fi

    serviceId=$(echo "$item" | jq -r '.service.id' 2>/dev/null)
    if [ -n "$serviceId" ]; then
      echo "Deploying service with ID: $serviceId and name $name"
      COUNTER=$((COUNTER+1))

      curl -s --request POST \
        --url "https://api.render.com/v1/services/$serviceId/deploys" \
        --header "accept: application/json" \
        --header "authorization: Bearer $API_KEY" \
        --header "content-type: application/json"

    else
      echo "Failed to get service ID for service: $item"
    fi
  done < <(echo "$parsed_response")

  echo $CURSOR

  RESPONSE_LENGTH=$(echo "$response" | jq -r '. | length' 2>/dev/null)

  if [ "$RESPONSE_LENGTH" -lt "$LIMIT" ] || [ -z "$CURSOR" ]; then
    break
  fi

  sleep 1
done

echo "Deployed $COUNTER services"
