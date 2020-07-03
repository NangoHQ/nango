# Pizzly Node.js client

Node.js client to query any APIs using [Pizzly](https://github.com/Bearer/Pizzly).

## Installation

```bash
npm install pizzly-node
# or
yarn add pizzly-node
```

## Usage

### Calling an API endpoint (proxy)

Once a user is connected, you can use its [`authId`](https://github.com/Bearer/Pizzly/wiki/Reference-:-Auth#the-authid-concept) to query any endpoint of the API.

```js
const Pizzly = require('pizzly-node') // or import { Pizzly } from 'pizzly-node'

const pizzly = new Pizzly({ host: 'pizzly.example.org' }) // Initialize Pizzly with your own instance
const myAPI = pizzly.integration('x-api') // Replace with the API slugname

myAPI
  .auth('x-auth-id') // Replace with a valid authId
  .get('/x-endpoint') // Replace with a valid endpoint
  .then(response => console.log) // Do something with the response
  .catch(console.error)
```

Most common HTTP methods are supported out-of-the-box, including `.get()`, `.post()`, `.put()` and `.delete()`.

### Handling the response

Under the hood, we use `node-fetch` to send requests. As a consequence, each `response` from the API are `Response` class of the [node-fetch](https://github.com/node-fetch/node-fetch#class-response) package. When the API uses JSON response type, you can retrieve the JSON response as follow:

```js
myAPI
  .auth('x-auth-id')
  .get('/x-endpoint')
  .then(response => response.json())
  .then(data => console.log(data)) // do something with the JSON payload (aka data)
  .catch(console.error)
```

## Advanced usage

### Using your secret key

It's highly recommended to secure your Pizzly instance after deployment ([learn more](https://github.com/Bearer/Pizzly/wiki/Secure-your-instance)). Once you've added a secret key, pass it to the client as follow:

```js
const Pizzly = require('pizzly-node') // or import { Pizzly } from 'pizzly-node'

const pizzly = new Pizzly({
  host: 'x-replace-with-your-pizzly-instance',
  secretKey: 'x-replace-with-your-secret-key'
})
```

### Passing extra params

Here's how to send headers to the API:

```js
myAPI
  .auth('x-auth-id')
  .post('/x-endpoint', { headers: { 'Content-Type': 'multipart/form-data; boundary=something' } })
  .then(console.log)
  .catch(console.error)
```

Here's how to send query string to the API:

```js
myAPI
  .auth('x-auth-id')
  .post('/x-endpoint', { query: { search: 'some keywords' } })
  .then(console.log)
  .catch(console.error)
```

Sending body works the same way:

```js
myAPI
  .auth('x-auth-id')
  .post('/x-endpoint', { body: 'My body' })
  .then(console.log)
  .catch(console.error)
```

### Async / await

Using `async/await` is supported to improve code readability:

```javascript
const response = await pizzly.integration('x-api').get('/x-endpoint')
```

In that snippet, `response` will be a `Response` interface of the [node-fetch](https://github.com/node-fetch/node-fetch#class-response) package.

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

## Reference

Pizzly Node.js client's reference:

```js
/**
 * Pizzly global namespace. Call it to initialize a Pizzly instance.
 *
 * @params options <object>
 *  - host <string> - The host of your Pizzly instance (e.g. "pizzly.example.org")
 *  - secretKey <string> - Optional. The secret key of your Pizzly instance
 *
 * @returns a new Pizzly instance.
 */

const Pizzly = (options) => {

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
     * Make a proxy request to the API (requests pass through the /proxy/ endpoint)
     *
     * @params endpoint <string> - The distant API endpoint
     * @params options <object> - The request options:
     * - headers <object> - The headers to send (e.g. { "Content-Type": "application/json" })
     * - query <object> - The query string to use (e.g. { "startAt": "1" } will be transformed into "?startAt=1")
     * - body <object> - The request's body to append (e.g. "foo=bar")
     * @returns a node-fetch response schema (https://www.npmjs.com/package/node-fetch)
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
