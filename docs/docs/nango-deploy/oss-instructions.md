# Self-Hosting Instructions

When self-hosting Nango, there is some configuration you need to take care of.

:::caution
Nango is a recent product and we are improving it fast.

At this point you should expect frequent changes to Nango, some of them requiring manual intervention upon updating your instance (i.e. breaking changes). We will do our best to always document these changes and providing you with a path to mitigate them. If you do not want to deal with this constraint, we recommend that you use [Nango Cloud](../cloud.md).

If you need help or have questions about self-hosting please feel free to reach out on our [Slack community](https://www.nango.dev/slack).
:::

## CLI

Let the CLI know where to query Nango by adding the `NANGO_HOSTPORT` env variable to your local environment (`.bashrc` or equivalent):

```bash
export NANGO_HOSTPORT=<YOUR-INSTANCE-URL>
```

## Server URL, Callback URL & Custom Domains {#custom-urls}

Add server environment variables for the instance URL and port (in the `.env` file or directly on Heroku/Render):

```
NANGO_SERVER_URL=<INSTANCE-URL>
SERVER_PORT=<PORT>
```

The resulting callback URL for OAuth will be `<INSTANCE-URL>/oauth/callback`.

:::info
Your can customize the callback URL by adding a `NANGO_CALLBACK_URL` environment variable (in the `.env` file or directly on Heroku/Render).
:::

:::info
If your are using a custom domain, you should change the `NANGO_SERVER_URL` server environment variable accordingly (in the `.env` file or directly on Heroku/Render).
:::

## Persistent storage

If deploying with Docker Compose (e.g. AWS, GCP, DO), the database is bundled in a docker container with transient storage. This means that updating the Docker image causes configs/credentials loss. This is a no-go for production.

Connect Nango to an external Postgres DB that lives outside the docker setup to mitigate this.

To do so, modify the default values of the following server env variables (in the `.env` file):

```
NANGO_DB_USER=<REPLACE>
NANGO_DB_PASSWORD=<REPLACE>
NANGO_DB_HOST=<REPLACE>
NANGO_DB_PORT=<REPLACE>
NANGO_DB_NAME=<REPLACE>
NANGO_DB_SSL=true
NANGO_DB_POOL_MIN=<PICK-INT-OR-SKIP>
NANGO_DB_POOL_MAX=<PICK-INT-OR-SKIP>
```

:::tip
Deploying with Render or Heroku automatically generates a persistent database connected to your Nango instance.

For Render, the environment variables above are automatically set for you. For Heroku, check out our Heroku docs page for specific instructions.
:::

:::tip
If you are using a serverless database, you might want to tune NANGO_DB_POOL_MIN and NANGO_DB_POOL_MAX params.
Otherwise, knex(ORM used in Nango) will be keeping connection alive and exhausting your serverless CPU quota.
:::

## Securing your instance

### Securing the API

You can secure your instance's API by adding the `NANGO_SECRET_KEY` env variable (in the `.env` file or directly on Heroku/Render).

This will require [Basic Auth](https://en.wikipedia.org/wiki/Basic_access_authentication) for all sensitive API requests, e.g.:

```bash
curl '<INSTANCE-URL>/connection/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>' -u '<SECRET-KEY>:'
```

❗️Notice the `:` character appended after `<SECRET-KEY>`.

If you are using the Node SDK, when initializing the `Nango` object, pass in the Secret key in the `secretKey` parameter.

```ts
import { Nango } from '@nangohq/node';

let nango = new Nango({ host: 'http://localhost:3003', secretKey: '<SECRET-KEY>' });
```

You should also configure the CLI to authenticate with Nango. Add to your `.bashrc` (or equivalent):

```bash
export NANGO_SECRET_KEY=<SECRET-KEY>
```

:::tip
The Frontend SDK does not need the Secret key to initiate OAuth flows.
:::

### Securing the dashboard

By default, the dashboard of your Nango instance is open to anybody who has access to your instance URL.

You can secure it with Basic Auth by setting the following environment variables and restarting the server:

```bash
NANGO_DASHBOARD_USERNAME=<PICK-A-USERNAME>
NANGO_DASHBOARD_PASSWORD=<PICK-A-PASSWORD>
```

### Encrypt sensitive data

You can enforce encryption of sensitive data (tokens, secret key, app secret) using the AES-GCM encryption algorithm. To do so, set the following environment variable to a randomly generated 256-bit base64-encoded key:

```
NANGO_ENCRYPTION_KEY=<ADD-BASE64-256BIT-KEY>
```

Once you restart the Nango server, the encryption of the database will happen automatically. Please note that, at the current time, you cannot modify this encryption key once you have set it.

### Restricting the creation of new connections

By default, your front-end application can attempt to create a new connection using any provider config key and connection ID.

In some applications, you may wish to restrict this, for example:

-   You may want to restrict the ability to create connections for a given provider config key based on the current user, if some users are permitted to create connections to that provider and others are not.
-   You may want to use your applications user ID as the connection ID, and need to ensure that application user is the only one that can create a new connection with that connection ID.

Nango provides the ability for an application to restrict the creation of new connections by the use of HMAC digests. The HMAC feature is disabled by default.

Once the HMAC feature is enabled, the Nango server will require that a HMAC digest is provided for every attempt to create a new connection from your front-end application.

The HMAC digest is generated by your application using a specified algorithm and key, and the digest is over the combination of the provider config key and the connection ID.

The algorithm and key must be shared between your application and the Nango server, so that the Nango server can verify the HMAC digest is correct. If the Nango server determines that the HMAC digest is missing or is invalid, then the request to create the new connection will be rejected.

Your application should only generate the HMAC digest after performing all authentication and authorization checks to ensure that the request to create the new connection is permitted. Your application should also keep the specified key private, and not reveal it to your front-end application or your end-users.

To enable the HMAC feature on the Nango server, set the following environment variables and restart the server:

```bash
NANGO_HMAC_ENABLED=true
NANGO_HMAC_KEY=<PICK-A-KEY>
```

Optionally, you change the algorithm from the default of `sha256` by setting the following environment variable and restarting the server:

```bash
NANGO_HMAC_ALGORITHM=sha384
```

When the HMAC feature is enabled, your front-end applicaton must always pass in an HMAC digest as follows:

```js
nango.auth('<CONFIG-KEY>', '<CONNECTION-ID>', { hmac: '<HMAC-DIGEST>' });
```

The HMAC digest can be generated by using the following code in your back-end application:

```js
import * as crypto from 'node:crypto';

// TODO: execute authentication and authorization checks before generating the HMAC digest.

// The default value for '<HMAC-ALGORITHM>' is 'sha256'.
// The value of '<HMAC-KEY>' should match the HMAC key passed to the Nango server.
const hmac = crypto.createHmac('<HMAC-ALGORITHM>', '<HMAC-KEY>');
hmac.update('<CONFIG-KEY>:<CONNECTION-ID>');
const digest = hmac.digest('hex');

// TODO: return the value of `digest` to the front-end application to pass to `nango.auth`.
```

## Telemetry

We use telemetry to understand Nango's usage at a high-level and improve it over time.

Telemetry on self-hosted instances is very light by default. We only track core actions and do not track sensitive information.

You can disable telemetry by setting the env var `TELEMETRY=false` (in the `.env` file or directly on Heroku/Render).
