# Pizzly JavaScript client

The hassle-free way to connect and integrate with any OAuth web application.

## Installation

Pizzly's JS can be used instantly in your page or with a package system.

### Directly in your page

```html
<script src="https://cdn.jsdelivr.net/npm/pizzly-js@latest/dist/index.umd.min.js"></script>
<script>
  // Initialize your code by passing your instance `hostname` as parameters.
  const pizzly = new Pizzly({ host: 'pizzly.example.org' })
</script>
```

### With a build system

```bash
npm install pizzly-js
# or
yarn add pizzly-js
```

## Usage

### Connecting to an OAuth based API

The `connect` method lets you trigger an OAuth-dance. On success, Pizzly returns an `authId` that acts as a unique identifier of the authentication process.

```js
const pizzly = new Pizzly({ host: 'pizzly.example.org' }) // Initialize Pizzly
const github = pizzly.integration('github')

github
  .connect()
  .then(({ authId }) => {
    // The authentication was successful
    console.log(`Auth ID is: ${authId}`)
  })
  .catch(error => {
    // The authentication failed
    console.error(error)
  })
```

Using this `authId`, you can make authenticated request to the API using the proxy mode.

### Calling an API endpoint (proxy)

Once a user is connected, you can query the API by providing the `authId`.

```js
github
  .auth('x-auth-id') // Replace with a valid authId
  .get('/repos')
  .then(response => console.log(response))
  .catch(console.error)

// Passing extra arguments
github
  .auth('x-auth-id')
  .post('/', { headers: {}, query: {}, body: '' })
  .then(response => console.log(response))
  .catch(console.error)
```

Most common HTTP methods are supported out-of-the-box, including `.get()`, `.post()`, `.put()` and `.delete()`.

### Handling the response

Under the hood, we use the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Response) to send requests. As a consequence, each `response` from the API are `Response` interface of the Fetch API. When the API uses JSON response type, you can retrieve the JSON response as follow:

```js
myAPI
  .auth('x-auth-id')
  .get('/x-endpoint')
  .then(response => response.json())
  .then(data => console.log(data)) // do something with the JSON payload (aka data)
  .catch(console.error)
```

## Advanced usage

### Retrieving the OAuth payload

When performing a connect, on success the OAuth payload is returned alongside the `authId`. Here's an example:

```js
github
  .connect()
  .then(({ payload }) => {
    // The authentication was successful
    console.log(`Access token is: ${payload.accessToken}`)
  })
  .catch(error => {
    // The authentication failed
    console.error(error)
  })
```

Pizzly also provides an API endpoint to retrieve at any time the OAuth payload:

```bash
curl -X GET "/api/API-SLUGNAME/authentications/AUTH-ID"
```

### Using a publishable key

When you've [secured your instance](https://github.com/Bearer/Pizzly/wiki/Secure-your-instance), you'll have to provide a `publishableKey` when initializing Pizzly. Here's how to do it:

```js
const pizzly = new Pizzly({ host: 'pizzly.example.org', publishableKey: '***' })
```

### Dealing with multiple configurations

By default, each request made through Pizzly uses the latest configuration that you have saved. If you have multiple configurations in place for the same API, you can tell Pizzly which configuration should be used.

```js
const config1 = '...'
const config2 = '...'

const github1 = pizzly.integration('github').setup(config1)
const github2 = pizzly.integration('github').setup(config2)

// Make a request with the 1st configuration
github1.get('/')

// Make another request with the 2nd configuration
github2.get('/')
```

<!--
### Saving a new configuration

If you don't know the configuration to use beforehand, you can save it on-the-fly using the client:

```js
const form = document.forms[0]
const clientId = form.clientId
const clientSecret = form.clientSecret
const scopes = form.scopes

pizzly
  .integration('github')
  .saveConfig({
    credentials: { clientId, clientSecret },
    scopes
  })
  .then({setupId} => {
    const github = pizzly.integration('github').config(setupId)
    github.get('/')
  })
```

This is particularly useful when you are trying to build a marketplace of integrations ([learn more](https://github.com/Bearer/Pizzly/wiki/TODO)).
-->

### Providing your own `authId`

For ease of use, you can provide your own `authId` when you connect a user to an API. For instance, you can reuse your own users IDs. This make it easy to keep track of which user is authenticated.

```js
github
  .auth('my-own-non-guessable-auth-id')
  .connect()
  .then()
  .catch()
```

In that example, Pizzly will not generate an `authId` but instead will use `my-own-non-guessable-auth-id`.

### Async / await

Using `async/await` is supported to improve code readability:

```javascript
const response = await pizzly.integration('github').get('/repositories')
```

In that snippet, `response` will be a `Response` interface of the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Response).

## Migration guide

For the developers previously using `@bearer/js`, find below a comparison with Pizzly:

| Topic                       | @bearer/js                                                      | Pizzly                                                                   |
| --------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Installation                | `npm install @bearer/js`                                        | `npm install @bearer/pizzly-js`                                          |
| Initialization              | `const bearerClient = bearer('BEARER_PUBLISHABLE_KEY')`         | `const pizzly = Pizzly('PUBLISHABLE_KEY', 'https://pizzly.example.org')` |
| `.connect()`                | `bearerClient.connect('github')`                                | `pizzly.connect('github')`                                               |
| `.connect()` with an authId | `bearerClient.connect('github', { authId })`                    | `pizzly.connect('github', { authId })`                                   |
| `.connect()` with a setupId | `bearerClient.connect('github', { setupId })`                   | `pizzly.connect('github', { setupId })`                                  |
| `.connect()` with both      | `bearerClient.connect('github', { setupId, authId })`           | `pizzly.connect('github', { setupId, authId })`                          |
| Integration's instance      | `const github = bearerClient.integration('github')`             | `const github = pizzly.integration('github')`                            |
| Proxy (GET)                 | `github.get('/')`                                               | `github.get('/')`                                                        |
| Proxy (POST)                | `github.post('/', { body: {} })`                                | `github.post('/', { body: {} })`                                         |
| Proxy with a setupId        | `github.setup(setupId).get('/')`                                | `github.setup(setupId).get('/')`                                         |
| Proxy with an authId        | `github.auth(authId).get('/')`                                  | `github.auth(authId).get('/')`                                           |
| Proxy with both             | `github.setup('').auth('').get('/')`                            | `github.setup(setupId).auth(authId).get('/')`                            |
| Configurations              | `bearerClient.invoke('github', 'bearer-setup-save', { setup })` | Not supported                                                            |

## Reference

Pizzly JavaScript client's reference:

```js
/**
 * Pizzly global namespace. Call it to initialize a Pizzly instance.
 *
 * @params options <object>
 *  - host <string|number> - The host of your Pizzly's instance (e.g. "example.org")
 *  - publishableKey <string> - The publishable key of your Pizzly's instance (optional)
 *
 * @returns a new Pizzly instance.
 */

const Pizzly = (options) => {

  /**
   * OAuth authentication handler
   *
   * @params integration <string> - The integration name (e.g. "github")
   * @params options <object>
   * - authId <string> - The authentication ID
   * - configId <string> - The configuration ID
   * - setupId <string> - Alias of the configuration ID (for legacy)
   * @returns data <object>
   * - authId <string> - The authentication ID
   * - payload <object> - The OAuth payload
   */

  connect: (integration: string[, options]) => {},

  /**
   * Integration's instance
   */

  integration: {

    /**
     * Set the configuration to use
     *
     * @params setupId <string> - The configuration ID
     * @returns a new integration's instance
     */

    setup: (setupId) => {},

    /**
     * Set the authentication to use
     *
     * @params authId <string> - The authentication ID
     * @returns a new integration's instance
     */

    auth: (authId) => {},

    /**
     * Alias for connect. Will reuse auth and setup if provided.
     *
     * @returns data <object>
     * - authId <string> - The authentication ID
     * - payload <object> - The OAuth payload
     */

    connect: () => {},

    /**
     * Make a proxy request to the API (requests pass through the /proxy/ endpoint)
     *
     * @params endpoint <string> - The distant API endpoint
     * @params options <object> - The request options:
     * - headers <object> - The headers to send (e.g. { "Content-Type": "application/json" })
     * - query <object> - The query string to use (e.g. { "startAt": "1" } will be transformed into "?startAt=1")
     * - body <object> - The request's body to append (e.g. "foo=bar")
     * @returns a Fetch response schema (https://developer.mozilla.org/en-US/docs/Web/API/Response)
     */

    get: (endpoint[, options]) => {},
    post: (endpoint[, options]) => {},
    put: (endpoint[, options]) => {},
    delete: (endpoint[, options]) => {},
    head: (endpoint[, options]) => {},
    patch: (endpoint[, options]) => {},
  }
}
```
