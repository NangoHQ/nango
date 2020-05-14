# Pizzly JavaScript client

The hassle-free way to connect and integrate with any OAuth web application.

## Getting started

Pizzly's JS can be used instantly in your page or with a package system.

### Directly in your page

```html
<script src="https://cdn.jsdelivr.net/npm/pizzly-js@latest/dist/index.umd.min.js"></script>
<script>
  // Initialize your code by passing your `publishableKey` and `hostname` as parameters.
  const pizzly = Pizzly(publishableKey, 'https://...')
</script>
```

### With a build system

```bash
yarn add pizzly-js
# or
npm install pizzly-js
```

## Usage

### Connecting to an OAuth based API

The `connect` method lets you trigger an OAuth-dance. On success, it returns the OAuth payload (i.e. `access_token`, `refresh_token`, etc.) that you can use to make authenticated requests to the API.

```js
pizzly
  .connect('github')
  .then(({ payload }) => {
    // The authentication was successful
    console.log(`Access token is: ${payload.accessToken}`)
  })
  .catch(error => {
    // The authentication failed
    console.error(error)
  })
```

### Authentication ID (authId)

When a user connects to an API, Pizzly generates an `authId` that acts as a unique identifier of the authentication process.

```js
pizzly
  .connect('github')
  .then(({ authId }) => {
    // The authentication was successful
    console.log(`Auth ID is: ${authId}`)
  })
  .catch(error => {
    // The authentication failed
    console.error(error)
  })
```

Using this `authId`, you can retrieve at a later time the OAuth payload:

```bash
curl -X GET "http://localhost/github/authentications/691d596a-8b76-4628-a3f5-f6b408177f93" \
-u "your_login:your_password" // TODO - Confirm it will be a basic authentication to query Pizzly's API
```

For ease of use, you can also provide your own `authId` that Pizzly will use instead of generating one ([learn more](https://github.com/Bearer/Pizzly/wiki/TODO)).

### Calling an API endpoint (proxy)

Once a user is connected, you can query the API by providing the `authId`.

```js
const github = pizzly.integration('github')

github
  .auth(authId)
  .get('/repos')
  .then(data => {
    console.log(data)
  })
  .catch(console.error)

// Passing extra arguments
github
  .auth(authId)
  .post('/', { headers: {}, query: {}, body: {} })
  .then(data => {
    console.log(data)
  })
  .catch(console.error)
```

Most common HTTP methods are supported out-of-the-box, including `.get()`, `.post()`, `.put()` and `.delete()`.

## Advanced usage

### Dealing with multiple configurations

By default, each request made through Pizzly uses the latest configuration that you have saved. If you have multiple configurations in place for the same API, you can tell Pizzly which configuration should be used.

```
const config1 = '...'
const config2 = '...'

const github1 = pizzly.integration('github').config(config1)
const github2 = pizzly.integration('github').config(config2)

// Make a request with the 1st configuration
github1.get('/')

// Make another request with the 2nd configuration
github2.get('/')
```

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

### Providing your own `authId`

For ease of use, you can provide your own `authId` when you connect a user to an API. For instance, you can reuse your own users IDs. This make it easy to keep track of which user is authenticated.

```js
pizzly
  .connect('github', { authId: 'my-own-non-guessable-auth-id' })
  .then()
  .catch()
```

In that example, Pizzly will use `my-own-non-guessable-auth-id` as the `authId`.

### Async / await

Using `async/await` is supported to improve code readability:

```javascript
const response = await pizzly.integration('github').get('/repositories')
```

In that snippet, `response` will be an [Axios response schema](https://github.com/axios/axios#response-schema) as we rely on that library.

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
| Configurations              | `bearerClient.invoke('github', 'bearer-setup-save', { setup })` | `github.saveConfig(config)`                                              |

## Reference

Pizzly JavaScript client's reference:

```js
/**
 * Pizzly global namespace. Call it to initialize a Pizzly instance.
 * @params publishableKey <string> - Your publishable key to authenticate the request
 * @params hostname <string> - The hostname of your Pizzly's instance (e.g. "http://localhost:3000")
 * @returns a new Pizzly instance.
 */

const Pizzly = (publishableKey, hostname) => {

  /**
   * OAuth authentication handler
   * @params integration <string> - The integration name (e.g. "github")
   * @params options <object>
   * - authId <string> - The authentication ID
   * - configId <string> - The configuration ID
   * - setupId <string> - Alias of the configuration ID (for legacy)
   * @returns TODO
   */

  connect: (integration: string[, options]) => {},

  /**
   * Integration's instance
   */

  integration: {

    /**
     * Set the configuration to use
     * @params configId <string> - The configuration ID
     * @returns a new integration's instance
     */

    config: (configId) => {},
    setup: (setupId) => {}, // Alias of config()

    /**
     * Set the authentication to use
     * @params authId <string> - The authentication ID
     * @returns a new integration's instance
     */

    auth: (authId) => {},

    /**
     * Make a proxy request to the API (requests pass through the /proxy/ endpoint)
     * @params endpoint <string> - The distant API endpoint
     * @params options <object> - The request options:
     * - headers <object> - The headers to send (e.g. { "Content-Type": "application/json" })
     * - query <object> - The query string to use (e.g. { "startAt": "1" } will be transformed into "?startAt=1")
     * - body <object> - The request's body to append (e.g. { "foo": "bar" })
     * @returns an Axios response schema (https://github.com/axios/axios#response-schema)
     */

    get: (endpoint[, options]) => {},
    post: (endpoint[, options]) => {},
    put: (endpoint[, options]) => {},
    patch: (endpoint[, options]) => {},
    delete: (endpoint[, options]) => {},

    /**
     * Save a new configuration
     * @params config <object> - The configuration to save
     *  - credentials <object> - The configuration's credentials
     *   - clientId <string> - For an OAuth2 based authentication, the Client ID
     *   - clientSecret <string> - For an OAuth2 based authentication, the Client Secret
     *   or
     *   - consumerKey <string> - For an OAuth1 based authentication, the Consumer Key
     *   - consumerSecret <string> - For an OAuth1 based authentication, the Consumer Secret
     *  - scopes <object> - The configuration's scopes
     * @returns TODO
     */

    saveConfig: (config) => {}
  }
}
```
