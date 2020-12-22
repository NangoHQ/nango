# Reference - Proxy

In pair with the [auth service](/docs/auth.md), Pizzly provides a proxy to perform authenticated requests to an API.

The proxy service forward all requests to the third-party API and handle the authentication part of the requests. Which make Pizzly not a transparent proxy, but an active one.

## Overview

The proxy service is reachable through the `/proxy/` endpoint.

```
https://your-pizzly-instance.example.org/proxy/api/endpoint
```

Where `api` should be replaced with the API slugname (e.g. `github`) and `endpoint` with the API endpoint. Here's another example with the `/user` endpoint of the GitHub API.

```
https://your-pizzly-instance.example.org/proxy/github/user
```

All requests send to the `/proxy/` endpoints must contain a mandatory `authId` provided within the headers, as follow:

```bash
curl -X POST /proxy/api/endpoint \
  -H "Pizzly-Auth-Id: a-valid-auth-id"
```

The proxy service will use that `authId` to authenticate the request to the third-party API. In case needed, the `access_token` will be refreshed before sending the requet. To learn how to retrieve an `authId`, look at the [examples page](/docs/examples.md).

You may wonder how Pizzly will perform the request having only the API slugname and the endpoint? Using the API configuration file, in the `./integrations` folder, it retrieves the information from the `request` property. This include the `baseURL` as well as any other headers or query string that the API is expecting.

## Authentication

By default, your Pizzly instance has permissive access. [When you have secured your instance](/docs/securing-your-instance.md) (which is highly recommended), requests to the proxy shall be authenticated with extra params. Here are a few examples to do so:

- Using a secret key, in cURL:

  ```bash
  curl -X POST /proxy/api/endpoint \
    -H "Pizzly-Auth-Id: REPLACE-WITH-AN-AUTH-ID"
    -u "REPLACE-WITH-YOUR-SECRET-KEY:"
  ```

- Using a secret key and the Node.js client (`pizzly-node`) for backend usage:

  ```js
  const pizzly = new Pizzly({ host: '...', secretKey: 'REPLACE-WITH-YOUR-SECRET-KEY' })

  pizzly.integration('api').auth('REPLACE-WITH-AN-AUTH-ID').get('/endpoint')
  ```

- Using a publishable key and the JavaScript client (pizzly-js) for frontend usage:

  ```js
  const pizzly = new Pizzly({ host: '...', publishableKey: 'REPLACE-WITH-YOUR-PUBLISHABLE-KEY' })

  pizzly.integration('api').auth('REPLACE-WITH-AN-AUTH-ID').get('/endpoint')
  ```

## Extra parameters

### Headers

Headers to be sent to the third-party API shall be prefixed using `Pizzly-Proxy` prefix. Here's an example:

```bash
curl -X POST /proxy/api/endpoint \
  -H "Pizzly-Auth-Id: REPLACE-WITH-AN-AUTH-ID"
  -H "Pizzly-Proxy-Content-Type: application/json"
```

If you use one of the official clients, the headers will be prefixed by default. Here's the same example using `pizzly-node`:

```js
const pizzly = new Pizzly({ host: '...' })

pizzly
  .integration('api')
  .auth('REPLACE-WITH-AN-AUTH-ID')
  .get('endpoint', { headers: { 'Content-Type': 'application/json' } })
```

### Query string

All query string will be forwared to the third-party API. No need to prefix them. Again, here's an example using cURL:

```bash
curl -X POST /proxy/api/endpoint?search=keyword \
  -H "Pizzly-Auth-Id: REPLACE-WITH-AN-AUTH-ID"
```

If you use one of the official clients, the query string can be provided alongside the endpoint or as arguments. Here's the same example using `pizzly-node`:

```js
const pizzly = new Pizzly({ host: '...' })

pizzly
  .integration('api')
  .auth('REPLACE-WITH-AN-AUTH-ID')
  .get('/endpoint?foo=bar', { query: { search: 'keyword' } })
```

### Body

The body is forwared AS IS to the third-party API using [a pipe](https://nodejs.org/en/knowledge/advanced/streams/how-to-use-stream-pipe/). Below are some examples with a `application/x-www-*form*-*urlencoded*` body, but other format (including binary) are supported as well:

```bash
curl -X POST /proxy/api/endpoint \
  -H "Pizzly-Auth-Id: REPLACE-WITH-AN-AUTH-ID"
  -H "Pizzly-Proxy-Content-Type: application/x-www-form-urlencoded"
  -d "foo=bar"
```

Again, here's an example using one of the official clients:

```js
const pizzly = new Pizzly({ host: '...' })

pizzly
  .integration('api')
  .auth('REPLACE-WITH-AN-AUTH-ID')
  .get('/endpoint', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: { foo: 'bar' },
  })
```
