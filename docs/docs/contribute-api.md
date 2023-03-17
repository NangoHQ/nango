---
sidebar_label: Contribute a New Provider
---

# Contribute a New Provider

Adding support for a new provider to Nango is fast & easy. Please follow the steps below and we will be happy to accept your PR!

If you find a bug with one of the existing providers feel free to use these steps to submit a PR with a fix. Thank you!

## Step 0: A quick overview of how provider templates work in Nango

Support for the OAuth flow of different providers in Nango is implemented with templates: A small config that tells Nango how to perform the OAuth flow for the specific provider.

All templates of Nango live in a single file called [providers.yaml](https://nango.dev/oauth-providers) in the `server` package. [More about YAML here](https://yaml.org/).

Most templates only need to make use of 2-3 configuration keys, but in some cases you might need more.
For a full list of configuration options please check the [type definitions here](https://github.com/NangoHQ/Nango/blob/master/packages/auth/lib/models.ts).

The most commonly used configuration options are:

```yaml
provider-slug: # Shorthand for the provider, ideally the provider's name. Must be unique. Kebab case.
    ##########
    # Mandatory fields
    ##########
    auth_mode: OAUTH2 # Either OAUTH1 (for OAuth 1.0a) or OAUTH2
    authorization_url: https://${connectionConfig.params.subdomain}.gitlab.com/oauth/authorize # The URL of the authorization page for the OAuth service (supports string interpolation)
    token_url: https://${connectionConfig.params.subdomain}.gitlab.com/oauth/token # The URL for the token request (supports string interpolation)

    ##########
    # Optional fields
    ##########
    authorization_params: # Additional parameters to pass along in the authorization step
        response_type: code
    token_params: # Additional parameters to pass along in the token request
        mycoolparam: value
    refresh_url: https://api.example.com/oauth/refresh # The URL to use for refreshing the access token (only if different from token_url)
    scope_separator: ',' # String to use to separate scopes. Defaults to ' ' (1 space) if not provided

    # Metadata capture
    redirect_uri_metadata:
        - subdomain # Save the 'subdomain' query parameter value returned in the Redirect URI (Connection Metadata)
    token_response_metadata:
        - scopes # Save the 'scopes' query parameter value returned in the token response (Connection Metadata)
```

:::info
Templates support parameters using string interpolation (cf. [flow Configuration](./reference/frontend-sdk.md#connection-config)) for dynamic URLs, etc.
:::

:::info
You can configure some [Connection Metadata](./reference/core-concepts.md#metadata), which is additional metadata that you want to capture during the OAuth flow and store in the Connection.
:::

## Step 1: Add your new provider to `providers.yaml`

Fork the repo and edit the `packages/server/providers.yaml` file as explained above to add support for the new provider. The API documentation should contain all the details you need on the OAuth flow to complete this step.

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

To propagate your changes after editing the `providers.yaml` file, run:

```
docker compose restart nango-server # Force a restart, which will load in the yaml again
docker compose run nango-server cat packages/server/providers.yaml # print the contents of the providers file from inside the container
```

When you are ready to test your new provider template:

### 1. Add your client credentials to the local Nango Server

Open the [local dashboard](http://localhost:3003) in your browser and add a new Integration with your freshly added provider (it should show up in the provider dropdown).

### 2. Navigate to the Test Website and Trigger the OAuth Flow

The test site should be running at [http://localhost:8001/bin/quickstart.html](http://localhost:8001/bin/quickstart.html)

You can modify the ports in the docker compose if there are any conflicts with other local services on your host machine.

### 3. Check the access token in the dashboard

If all goes well you should see your new Connection in the [Connections list](http://localhost:3003/connections) in the dashboard.

Check the Connection details and make sure all looks as expected (access token, refresh token, metadata).

## Step 3: Add your integration to the Documentation

Add a file named `<provider_slug>.md` (e.g. `github.md`) corresponding to your new integration to the `docs/docs/providers` folder. You can check out check out [airtable](./providers/airtable.md) for an example.

Also, add your new documentation page to [`docs/sidebar.js`](https://github.com/NangoHQ/nango/blob/master/docs/sidebars.js) in the `items` array (in alphabetical order):

[![Provider Sidebar List](/img/provider-sidebar.png)]

## Step 4: Submit your PR

Submit your PR with the new provider to the Nango repo. Please thoroughly test the integration and include the following mention in your PR: "I successfully tested the provider config creation, OAuth flow & valid token."

We will review your PR asap and merge it into the main Nango repo for inclusion with the next release.

Thanks a lot for your contribution!! ❤️

## Where to get help

If you get stuck or need help please join our [Slack community](https://nango.dev/slack) where the Nango contributors hang out. We will do our best to help you and get Nango to work with the OAuth flow of your provider.
