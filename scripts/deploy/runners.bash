#!/bin/bash

# Available Environment Variables
# ENVIRONMENT
# API_KEY
# RUNNER_OWNER_ID

CURSOR=""

while true; do
  response=$(curl -s --request GET \
     --url "https://api.render.com/v1/services?limit=20&ownerId=$RUNNER_OWNER_ID&cursor=$CURSOR" \
     --header "accept: application/json" \
     --header "authorization: Bearer $API_KEY")


  CURSOR=$(echo "$response" | jq -r '.[-1].cursor')

  if [ -z "$CURSOR" ]; then
    break
  fi

  json_array=$(echo "$response" | jq -c '.[]')

  for item in $json_array; do
    name=$(echo "$item" | jq -r '.service.name')
    if [[ "$name" != "$ENVIRONMENT-runner-"* ]]; then
      continue
    fi

    serviceId=$(echo "$item" | jq -r '.service.id')
    echo "Deploying service with ID: $serviceId and name $name"

    #curl --request POST \
      #--url "https://api.render.com/v1/services/$serviceId/deploys" \
      #--header "accept: application/json" \
      #--header "authorization: Bearer $API_KEY" \
      #--header "content-type: application/json"

    sleep 1
  done
done

