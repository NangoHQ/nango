On top of the dashboard, Pizzly comes with a REST API, that lets you programmatically work with your integrations, their configurations, and the authentications made. If you are looking for the APIs supported by Pizzly, [have a look to this article](/docs/supported-apis.md) instead.

## Overview

The API is REST inspired, meaning that you query it with HTTP methods where `GET` = retrieve, `PUT` = save, `POST` = update and `DELETE` = delete. The API accepts and returns JSON objects.

The main endpoints are:

- `/api/:integration` - To retrieve an integration's details (e.g. `/api/github/`)
- `/api/:integration/configurations` - To retrieve a list of configurations for that integration
- `/api/:integration/configurations/:setupId` - To request a specific configuration
- `/api/:integration/authentications` - To retrieve a list of authentications for that integration
- `/api/:integration/authentications/:authId` - To request a specific authentication
- `/api/:integration/authentications/:authId/refresh` - To refresh a specific authentication

While most actions are available through the dashboard, there are two common use cases wit Pizzly's API:

- saving an integration's configuration on-the-fly (`POST /api/:integration/configurations`);
- retrieving an OAuth payload (`GET /api/:integration/authentications`).

## Authentication

After having [secured your Pizzly's instance](./Secure-your-instance) _(recommended)_, all requests to the API must be authenticated with a secret key. Here's an example in curl on how to make an authenticated request:

```bash
curl -X GET /api/github/configurations \
 -u "your-secret-key:"
```

In Node.js, the request requires some extra work:

```javascript
const fetch = require('node-fetch')

const url = 'http://locahost:8080/api/'
const secretKey = 'secure-secret-key'
const authentication = 'Basic ' + Buffer.from(secretKey + ':').toString('base64')

fetch(url, { headers: { Authorization: authentication } })
```

## Endpoints

The API endpoints are organized around 3 objects:

- [Integrations](#Integrations) - i.e. how Pizzly integrates with an API;
- [Configurations](#Configurations) - i.e. the credentials and scopes of your application;
- [Authentications](#Authentications) - i.e. the [`authId`](/docs/auth.md#the-authid-concept) retrieved after performing an OAuth-dance.

### Integrations

An integration is a `.json` file that tells Pizzly how to integrate with an API. All available integrations on your Pizzly's instance are stored under `/integrations` folder.

#### Retrieve an integration's details

To retrieve an integration's details, perform a `GET` request.

```bash
curl -X GET /api/github
```

It returns something like:

```json
{
  "object": "integration",
  "id": "github",
  "name": "GitHub",
  "image": "http://logo.clearbit.com/github.com",
  "auth": {
    "authorizationURL": "https://github.com/login/oauth/authorize",
    "tokenURL": "https://github.com/login/oauth/access_token",
    "authType": "OAUTH2",
    "tokenParams": {},
    "authorizationParams": {},
    "auth": {
      "accessType": "offline"
    }
  },
  "request": {
    "baseURL": "https://api.github.com/",
    "headers": {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": "token ${auth.accessToken}",
      "User-Agent": "Pizzly"
    }
  }
}
```

### Configurations

The API provider will provide you an interface to create your application and retrieve a pair of credentials (clientId/clientSecret for OAuth2, consumerKey/consumerSecret for OAuth1). These credentials alongside the scopes form together the configuration of your integration.

#### Save a new configuration

While the dashboard lets you save configuration from a browser, you can also save them programmatically. This is particularly useful when you have a batch of configurations to save or you provide a way to save third-party credentials.

```bash
curl -X POST /api/github/configurations \
-H "Content-Type: application/json" \
-d '{"credentials": { "clientId": "...", "clientSecret": "..." }}'
```

It returns something like:

```json
{
  "message": "Configuration registered",
  "configuration": {
    "object": "configuration",
    "id": "a3ef22ba-8916-424f-b613-9e8608026094",
    "scopes": ["user:email"],
    "credentials": {
      "clientId": "e9ca***************",
      "clientSecret": "a2f0***********************"
    }
  }
}
```

#### Retrieve a configuration

To retrieve a configuration,

```bash
curl -X GET /api/github/configurations/72184458-7751-41fe-8dcc-0251ab2cc578
```

It returns something like:

```json
{
  "object": "configuration",
  "id": "a3ef22ba-8916-424f-b613-9e8608026094",
  "scopes": ["user:email"],
  "credentials": {
    "clientId": "e9ca***************",
    "clientSecret": "a2f0***********************"
  }
}
```

#### Update a configuration

To update a configuration:

```bash
curl -X PUT /api/github/configurations/72184458-7751-41fe-8dcc-0251ab2cc578 \
-H "Content-Type: application/json" \
-d '{"credentials": { "clientId": "abcd***************", "clientSecret": "1234***********************" }}'
```

It returns something like:

```json
{
  "message": "Configuration updated",
  "configuration": {
    "object": "configuration",
    "id": "a3ef22ba-8916-424f-b613-9e8608026094",
    "scopes": [],
    "credentials": {
      "clientId": "abcd***************",
      "clientSecret": "1234***********************"
    }
  }
}
```

#### Delete a configuration

To delete a configuration:

```bash
curl -X DELETE /api/github/configurations/72184458-7751-41fe-8dcc-0251ab2cc578 \
```

It returns something like:

```json
{ "message": "Configuration removed" }
```

### Authentications

Authentications (aka `authId`) act as references to the OAuth payload (aka the `access_token` and `refresh_token`). If you are not familiar with the concept of `authId` introduced by Pizzly, have a look at the [Auth reference](/docs/auth.md#the-authid-concept).

#### Retrieve an authentication

To retrieve the OAuth payload associated to an `authId`, perform a `GET` request as follows:

```bash
curl -X GET /api/github/authentications/1994cc00-a4d6-11ea-9187-b798bad9d2ac
```

It returns something like:

```json
{
  "object": "authentication",
  "id": "1994cc00-a4d6-11ea-9187-b798bad9d2ac",
  "payload": {
    "updatedAt": 1591105005515,
    "accessToken": "7fde*************************",
    "refreshToken": "789b*************************"
  },
  "created_at": "2020-06-02T13:36:45.517Z",
  "updated_at": "2020-06-02T13:36:45.517Z"
}
```

#### Refresh an authentication

To refresh an access token, perform a `POST` request as follows:

```bash
curl -X POST /api/github/authentications/1994cc00-a4d6-11ea-9187-b798bad9d2ac/refresh
```

It returns something like:

```json
{
  "message": "Authentication refreshed",
  "authentication": {
    "object": "authentication",
    "id": "1994cc00-a4d6-11ea-9187-b798bad9d2ac",
    "payload": {
      "updatedAt": 1591105005515,
      "accessToken": "afCe*************************",
      "refreshToken": "897a*************************"
    },
    "created_at": "2020-06-02T13:36:45.517Z",
    "updated_at": "2020-06-02T15:36:45.517Z"
  }
}
```

#### Delete an authentication

To delete an authentication:

```bash
curl -X DELETE /api/github/authentications/1994cc00-a4d6-11ea-9187-b798bad9d2ac
```

It returns something like:

```json
{ "message": "Authentication removed" }
```
