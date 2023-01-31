# Securing Your Instance

## Protecting developer & user credentials

For endpoints related to configuring providers and fetching user credentials, Nango uses [Basic Auth](https://en.wikipedia.org/wiki/Basic_access_authentication).

To activate Basic Auth, generate an API key (e.g. [here](https://codepen.io/corenominal/pen/rxOmMJ)) and add it to the `NANGO_SECRET_KEY` environment variable (in the `.env` file at the root of the Nango folder).

:::info
This API key should be kept secret at all time and never committed to git. Compromising the API key would compromise your developer and user credentials stored with Nango.
:::

Once you redeploy Nango, it will expect this secret API key for any sensitive request. 

### CLI requests

Add the `NANGO_SECRET_KEY` as an environment variable for your own environment, using your `.bashrc` or `.zshrc` file.

### Node SDK

When initializing the `Nango` object, pass in the API key in the `secretKey` parameter.

```ts
import { Nango } from '@nangohq/node'

// Tell Nango where to find your Nango server + the secret API key.
let nango = new Nango('http://localhost:3003', apiKey);
```

### REST API

Add a Basic `Authorization` header to your requests. To generate the header value: 
1. Append the character `:` to your secret API key
2. Encode this (`[SECRET-API-KEY] + ':'`) in Base 64
3. The final header value should be `Basic [ENCODED-VALUE]`

In Javascript, setting the authorization header looks like this: 
```javascript
headers['Authorization'] = 'Basic ' + Buffer.from(process.env['NANGO_SECRET_KEY'] + ':').toString('base64');
```
