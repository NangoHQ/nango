# Self-Hosting Instructions

When self-hosting Nango, there is some configuration you need to take care of.

### CLI

Let the CLI know where to query Nango by adding the `NANGO_HOSTPORT` env variable to your local environment (`.bashrc` or equivalent):

```bash
export NANGO_HOSTPORT=<YOUR-INSTANCE-URL>
```

### Server URL & Callback URL

Add you instance url to the `.env` file at the root of the `nango` folder (and restart the Docker container):

```
NANGO_SERVER_URL=<INSTANCE-URL>
```

The resulting callback URL for OAuth will be `<INSTANCE-URL>/oauth/callback`.

### Persistent storage

By default, the database is bundled in the docker container with transient storage. This means that updating the Docker image causes configs/credentials loss. This is a no-go for production.

Connect Nango to an external Postgres DB that lives outside the docker setup to mitigate this.

To do so, replace the values of the following env variables in the `.env` file at the root of the `nango` folder (and restart the container):

```
NANGO_DB_USER=<REPLACE>
NANGO_DB_PASSWORD=<REPLACE>
NANGO_DB_HOST=<REPLACE>
NANGO_DB_PORT=<REPLACE>
NANGO_DB_NAME=<REPLACE>
NANGO_DB_SSL=<REPLACE>
```

### Securing your instance

You can secure your instance by adding the `NANGO_SECRET_KEY` variable to the `.env` file at the root of the `nango` folder (and restarting the Docker container).

This will require Basic Authentication for all sensitive requests, e.g.:

```bash
curl '<INSTANCE-URL>/connection/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>' -u '<NANGO-SECRET-KEY>:'
```

❗️Notice the `:` character appended after `<NANGO-SECRET-KEY>`.

You should also configure the CLI to authenticate with Nango. Add to your `.bashrc` (or equivalent):

```bash
export NANGO_SECRET_KEY=<NANGO-SECRET-KEY>
```

### Updating your instance

When self-hosting Nango, you will need to update your instance yourself to benefit from improvements and new API templates. It should be as simple as running:

```bash
docker-compose stop
docker-compose rm -f
docker-compose pull
docker-compose up -d
```

:::warning
Nango is a recent product that we are improving fast. You should expect frequent changes to Nango, some of them requiring manual intervention upon updating your instance (i.e. breaking changes). We will do our best effort to always document these changes and assist you in implementing them. If you do not want to deal with this constraint, we recommend that you use [Nango Cloud](../cloud.md).
:::
