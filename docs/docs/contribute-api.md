---
sidebar_label: Contribute a New Provider
---

# Contribute a New API Provider

Adding support for a new API provider to Nango is fast & easy. Please follow the steps below and we will be happy to accept your PR! You should also join the `#contribution` channel on our [Slack community](https://nango.dev/slack).

Don't know which API provider to contribute? Here's a [list](https://github.com/orgs/NangoHQ/projects/2) you can pick from!

### Step 0: Provider Template overview

Support for the OAuth flow of different providers is implemented with templates: A small config that tells Nango how to perform the OAuth flow for the specific provider.

All templates of Nango live in a single file called [providers.yaml](https://nango.dev/oauth-providers) in the `server` package.

Most templates only need to make use of 3 configuration keys, but in some cases you might need more.

The most commonly used configuration options are:

```yaml
provider-slug: # Shorthand for the provider, ideally the provider's name. Must be unique. Kebab case.
    ##########
    # Mandatory fields
    ##########
    auth_mode: OAUTH2 # Either 'OAUTH1' or 'OAUTH2'
    authorization_url: https://${connectionConfig.params.subdomain}.gitlab.com/oauth/authorize # The URL of the authorization page for the OAuth service (supports string interpolation)
    token_url: https://${connectionConfig.params.subdomain}.gitlab.com/oauth/token # The URL for the token request (supports string interpolation)

    ##########
    # Optional fields
    ##########
    authorization_params: # Additional parameters to pass along in the authorization step
        response_type: code
    token_params: # Additional parameters to pass along in the token request
        mycoolparam: value
    refresh_params: # Additional parameters to pass along in the refresh token request (defauts to the 'token_params')
        grant_type: refresh_token
    refresh_url: https://api.example.com/oauth/refresh # The URL to use for refreshing the access token (only if different from token_url) Warning: currently unused, requires code change before using
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

### Step 1: Fork the Nango repo

Go to https://github.com/NangoHQ/nango.git and fork the Nango repo.

### Step 2: Run Nango locally

Clone the forked repo and run the Nango server locally:

```bash
git clone https://github.com/[YOUR-GITHUB-ORG]/nango.git && cd nango
docker compose up # Keep the tab open
```

:::tip
Your 3003 port is already used? Modify the port in the `docker-compose.yaml` and `.env`.
:::

### Step 3: Create a developer account & OAuth app on the API Provider's developer portal

To create an OAuth app, you will need to provide a callback url. If you are running Nango locally, the default callback URL is `https://localhost:3003/oauth/callback`.

:::tip
Some OAuth providers require `https` callbacks or don't allow `localhost` callbacks. A workaround is to use [https://redirectmeto.com](https://redirectmeto.com/). With this, the Nango localhost callback URL becomes `https://redirectmeto.com/http://localhost:3003/oauth/callback` and you will need to update the `NANGO_CALLBACK_URL` env variable in the `.env` file.
:::

### Step 4: Add your new provider to `providers.yaml`

Edit the `packages/server/providers.yaml` file as explained in the Step 0 to add support for the new provider. The provider's API documentation should contain all the details you need on the OAuth flow to complete this step.

Propagate your changes by running:

```bash
docker compose restart nango-server # Force a restart, which will load in the yaml again
```

```bash
docker compose run nango-server cat packages/server/providers.yaml # Print the contents of the providers file from inside the container
```

### Step 5: Create a new integration & connection in Nango

Open the [Dashboard's home page](http://localhost:3003) and add a new Integration with your freshly added provider.

Run an OAuth flow from the [Dashboard's connection creation page](http://localhost:3003/connection/create).

If all goes well you should see your new Connection in the [Dashboard's connection list page](http://localhost:3003/connections).

### Step 6: Add your integration to the Documentation

Add a file named `<provider_slug>.md` (e.g. `github.md`) corresponding to your new integration to the `docs/docs/providers` folder.

You can check out check out [airtable](./providers/airtable.md) for an example page. Your integration page should contain at least:

-   Information about the API provider's developer approval (e.g. immediate, requires manual approval, requires payment, etc.)
-   The link to create a developer account on the API provider's developer portal
-   The link to the oauth-related documentation page of the API provider
-   The link to the documentation page listing the OAuth scopes of the API provider

Add your new documentation page to [`docs/sidebar.js`](https://github.com/NangoHQ/nango/blob/master/docs/sidebars.js) in the `items` array (in alphabetical order):

[![Provider Sidebar List](/img/provider-sidebar.png)]

### Step 7: Add the integration logo (optional)

If you want to keep Nango pretty, optionally add the provider logo in SVG to `packages/webapp/public/images/template-logos/`:

-   the name of the file should be `<provider_slug>.svg`
-   the logo should be 44px on its longest side (width or height), centered (vertically & horizontally) inside a 62x62px transparent box
-   if the logo is dark and hardly visible on a dark background, the 62x62px box should be white with a 10px corder radius (instead of transparent)

### Step 8: Submit your PR

Submit your PR with the new provider to the Nango repo.

Feel free to ping `Bastien` on the [Slack community](https://nango.dev/slack) to fast track the integration deployment (<1h).

Thanks a lot for your contribution!! ❤️

## Where to get help

If you get stuck or need help please join our [Slack community](https://nango.dev/slack) where the Nango contributors hang out.
