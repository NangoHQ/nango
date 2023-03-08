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
```

:::tip
Deploying with Render or Heroku automatically generates a persistent database connected to your Nango instance.

For Render, the environment variables above are automatically set for you. For Heroku, check out our Heroku docs page for specific instructions.
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

By default, unless you used "Deploy to Render" or "Deploy to Heroku", the dashboard of your Nango instance (with access to credentials) is open to anybody who has access to the instance URL.

You can secure it with Basic Auth by setting the following environment variables and restarting the server:

```bash
NANGO_DASHBOARD_USERNAME=<PICK-A-USERNAME>
NANGO_DASHBOARD_PASSWORD=<PICK-A-PASSWORD>
```

If you used the "Deploy to Render" or "Deploy to Heroku" option these two environment variables have already been set with a random value for you. Edit them if needed.

## Telemetry

We use telemetry to understand Nango's usage at a high-level and improve it over time.

Telemetry on self-hosted instances is very light by default. We only track core actions and do not track sensitive information.

You can disable telemetry by setting the env var `TELEMETRY=false` (in the `.env` file or directly on Heroku/Render).
