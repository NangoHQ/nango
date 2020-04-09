# ApiRouter

| Scope       | Stage        | Package                            | URL                                             |
| ----------- | ------------ | ---------------------------------- | ----------------------------------------------- |
| API         | `dev`        | `api-router-dev-ApiService`        | `https://int.dev.bearer.sh/api/v1/{proxy+}`     |
| HTML        | `dev`        | `api-router-dev-ApiService`        | `https://int.dev.bearer.sh/v1/{proxy+}`         |
| API         | `staging`    | `api-router-staging-ApiService`    | `https://int.staging.bearer.sh/api/v1/{proxy+}` |
| HTML        | `staging`    | `api-router-staging-ApiService`    | `https://int.staging.bearer.sh/v1/{proxy+}`     |
| API         | `production` | `api-router-production-ApiService` | `https://int.bearer.sh/api/v1/{proxy+}`         |
| HTML        | `production` | `api-router-production-ApiService` | `https://int.bearer.sh/v1/{proxy+}`             |
| BACKEND_API | `production` | `api-router-production-ApiService` | `https://int.bearer.sh/backend/api/v1/{proxy+}` |
| WEBHOOK_API | `production` | `api-router-production-ApiService` | `https://int.bearer.sh/webhook/v1/{proxy+}`     |

## Endpoints

| Scope       | endpoint                           | implemented :white_check_mark: / :x: |
| ----------- | ---------------------------------- | :----------------------------------: |
| HTML        | `/user/initialize`                 |          :white_check_mark:          |
| HTML        | `/auth/:integration_uuid`          |          :white_check_mark:          |
| HTML        | `/auth/:integration_uuid/callback` |          :white_check_mark:          |
| HTML        | `/auth/:service/callback`          |          :white_check_mark:          |
| HTML        | `/account/:integration_uuid`       |          :white_check_mark:          |
| API         | `/signup`                          |          :white_check_mark:          |
| API         | `/login`                           |          :white_check_mark:          |
| API         | `/refresh_token`                   |          :white_check_mark:          |
| API         | `/items/:reference_id`             |          :white_check_mark:          |
| API         | DELETE `/items/:reference_id`      |          :white_check_mark:          |
| API         | POST `/items`                      |          :white_check_mark:          |
| API         | PUT `/items/:reference_id`         |          :white_check_mark:          |
| API         | `/:integration_uuid/:action_id`    |          :white_check_mark:          |
| API         | `/:integration_uuid/:action_id`    |          :white_check_mark:          |
| BACKEND_API | `/:integration_uuid/:action_id`    |          :white_check_mark:          |
| WEBHOOK_API | `/config`                          |          :white_check_mark:          |
| WEBHOOK_API | `/t/:uuid`                         |          :white_check_mark:          |

### `/user/initialize`

Get access to the iframe. This will also check the cookie and generate a `uuid` if this one doesn't exist.

### `/auth/:integration_uuid`

When the user hits this endpoint, we will go through the OAuth dance to get the user a token.
We will pass a signed cookie so that it will be possible from the callback URL to attached the `integration_uuid`, the `user_id` and the `token`

### `/auth/:integration_uuid/callback`

**To Be Deprecated**

Once the user has successfully authorized the application, the user will be redirected to this callback URL.
It will store the `integration_uuid`, the `token` and the `user_id`.

### `/auth/:service/callback`

Once the user has successfully authorized the application, the user will be redirected to this callback URL.
It will store the `integration_uuid`, the `token` and the `user_id`.

### `/account/:integration_uuid`

Once the user has been authenticated, it will be redirected to this URL, which will basically return a `200`.

### `/:integration_uuid/:action_id`

Pass an `integration_uuid` along with an `action_id` (which is an intent defined within the package), to get it executed using the user's token.

## How to test?

We use jest to test the integration service pieces

```
 $ # setup env variables correctly
 $ cp .envrc{.example,}
 $ #  start a local dynamodb server (listening on 8000)
 $ docker-compose up -d
 $ yarn test
```

## How to deploy?

This repository uses `drone.io` as CI//CD. If you would like to try your code/branch on staging before mergin to master, you can do it by pushing on the `staging` branch.

## Running Locally

1. Use ssh tuneling to connect to staging dashboard-api

```
docker-compose up -d # To start the redis cluster
$ yarn start:staging
Killing the http tunnel to the dashboard
Import secrets from secret manager from arn:aws:secretsmanager:eu-west-1:794568872834:secret:local/is-Yn35MQ
It seems that the following modules have been required before Sqreen:
- /Users/tarikihadjadene/projects/bearer/integration-service/node_modules/newrelic/index.js
Sqreen may not be able to protect the whole application.
If you think this is an error, please report it to Sqreen team.
Read more on https://doc.sqreen.io/docs/nodejs-agent-installation
[bugsnag] Loaded!
express-session deprecated undefined resave option; provide resave option src/auth/v3/session.ts:18:37
express-session deprecated undefined saveUninitialized option; provide saveUninitialized option src/auth/v3/session.ts:18:37
Integration service app listening on port 8002
```

2. Call proxy endpoint

To call the proxy endpoint you will need to set the Host header to `proxy.staging.bearer.sh`

Example :

```
curl -X GET \
    -H 'Authorization: sk_product`on_OC6LEXmykI7zg4k0r9xQfBR_ZszfTYMF' \
    -H "Host: proxy.staging.bearer.sh" \
    -H 'Bearer-Auth-Id: 0da61ec0-e4f2-11e9-9297-7bb04faac2f4' \
    "http://localhost:8002/github/user/repos"
```
