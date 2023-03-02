---
sidebar_label: Contribute a New Provider
---

# Contribute a New Provider

Adding support for a new provider to Nango is fast & easy. Please follow the steps below and we will be happy to accept your PR!

If you find a bug with one of the existing providers feel free to use these steps to submit a PR with a fix. Thank you!

## Step 0: A quick overview of how provider templates work in Nango

Support for the OAuth flow of different providers in Nango is implemented with templates: A small config that tells Nango how to perform the OAuth flow for the specific provider.

All templates of Nango live in a single file called [providers.yaml](https://nango.dev/oauth-providers) in the server package. [More about YAML here](https://yaml.org/).

Most templates only need to make use of 2-3 configuration keys, but in some cases you might need more.
For a full list of configuration options please check the [type definitions here](https://github.com/NangoHQ/Nango/blob/master/packages/auth/lib/models.ts).

The most commonly used configuration options are:

```yaml
# All keys & slugs use lowercase and snake_case
provider_slug: # Shorthand for the provider, ideally the provider's name. Must be unique.
    # Mandatory fields
    auth_mode: OAUTH2 # Either OAUTH1 (for OAuth 1.0a) or OAUTH2
    authorization_url: https://${connectionConfig.params.subdomain}.gitlab.com/oauth/authorize # The URL of the authorization page for the OAuth service (supports string interpolation)
    token_url: https://${connectionConfig.params.subdomain}.gitlab.com/oauth/token # The URL for the token request (supports string interpolation)

    # Optional fields
    authorization_params: # Additional parameters to pass along in the authorization step
        response_type: code
    token_params: # Additional parameters to pass along in the token request
        mycoolparam: value
    refresh_url: https://api.example.com/oauth/refresh # The URL to use for refreshing the access token, if different from token_url
    scope_separator: ',' # String to use to separate scopes. Defaults to ' ' (1 space) if not provided
    redirect_uri_metadata:
        - subdomain # Save the 'subdomain' query parameter value returned in the Redirect URI (Connection Metadata)
    token_response_metadata:
        - scopes # Save the 'scopes' query parameter value returned in the token response (Connection Metadata)
```

:::info
Templates support parameters using string interpolation (cf. [Connection Configuration](./reference/configuration.md#connection-config)) for dynamic URLs, etc.
:::

:::info
Verify if some [Connection Metadata](./reference/configuration.md#connection-metadata) should be captured during the OAuth flow.
:::

## Step 1: Add your new provider to `providers.yaml`

Fork the repo and edit the `packages/auth/providers.yaml` file as explained above to add support for the new provider. The API documentation should contain all the details you need on the OAuth flow to complete this step.

[We are here](https://nango.dev/slack) if you need help with this.

## Step 2: Test your new provider

:::tip
Some OAuth providers are very restrictive with callback URIs and require https or don't allow `localhost` as a domain/URL. This can make it very hard to test things locally.

The easiest workaround we found is to use this simple service: [https://redirectmeto.com](https://redirectmeto.com/).

With this the Nango localhost callback URL becomes `https://redirectmeto.com/http://localhost:3003/oauth/callback` and you will need to update the `NANGO_CALLBACK_URL` in the `.env` file:

```bash
NANGO_CALLBACK_URL=https://redirectmeto.com/http://localhost:3003/oauth/callback
```

:::

To test your new provider:

The docker compose configuration in the root of the repo `docker-compose.yaml` will run 3 containers.

1. Postgres DB
2. Nango Server
3. Test Website to Trigger the OAuth Flow

The providers.yaml file from step 1 is synced between the host machine (your laptop) and the running Nango Server container. When you add new provider templates to that yaml the running Nango Server will pick them up.

If your changes don't seem to be getting picked up, then try:

```
# Force a restart, which will load in the yaml again
docker compose restart nango-server

# print the contents of the providers file from inside the container
docker compose run nango-server cat packages/auth/providers.yaml
```

When you are ready to test your new provider template:

### 1. Add your client credentials to the local Nango Server by running the npx nango command

```
npx nango config:create <unique-config-key> <template-name> <cliend-id> <client-secret> <scopes>

```

Note: if you've already configured environment variables for Nango Cloud or your own remote instance of Nango then you may need to unset those variables as they will interfere with your local testing.

### 2. Navigate to the Test Website and Trigger the OAuth Flow

The test site should be running at [http://localhost:8001/bin/quickstart.html](http://localhost:8001/bin/quickstart.html)

You can modify the ports in the docker compose if there are any conflicts with other local services on your host machine.

### 3. Request an Access Token from Your New Provider

In the cli run the npx nango command to fetch a new token or make a curl request to the locally running Nango Server.

```
> npx nango token:get <unique-config-key> <connection-id>


> curl 'http://localhost:3003/connection/<connection-id>?provider_config_key=<unique-config-key>'
```

Once you've confirmed the access token was returned, then you are ready to submit a PR.

## Step 3: Add your integration to the Documentation

Add a file named `<provider_slug>.md` (e.g. `github.md`) corresponding to your new integration to the `docs/docs/providers` folder. You can check out check out [airtable](./providers/airtable.md) for an example.

## Step 4: Submit your PR

Submit your PR with the new provider to the Nango repo. Please make sure to mention that you tested the full flow and that it works. We will review your PR asap and merge it into the main Nango repo for inclusion with the next release.

## Where to get help

If you get stuck or need help please join our [Slack community](https://nango.dev/slack) where the Nango contributors hang out. We will do our best to help you and get Nango to work with the OAuth flow of your provider.
