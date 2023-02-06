# Step-by-step guide

In about **15-20 minutes**, let's set up an OAuth integration in your app for any external API.

:::tip
If using [Nango Cloud](cloud), replace all mentions of `http://localhost:3003` by your Server URL. You should also have configured local env variables to enable the CLI ([instructions](cloud)).
:::

## Step 0: Start Nango

❗️Skip this step if you use [Nango Cloud](cloud).

Clone and start Nango:

```bash
git clone https://github.com/NangoHQ/quickstart.git && cd quickstart
docker compose up # Keep the tab open
```

## Step 2: Configure a provider

To access an OAuth API, you need a few things from the OAuth provider/API:

1.  Find the **template name** for the OAuth provider from the [list of pre-configured APIs](https://nango.dev/oauth-providers) (usually the name of the API in lowercase, e.g. `github`, `asana`, `linkedin` etc.)

2.  Obtain a **Client ID** and **Client Secret** from the OAuth provider. These credentials identify your application towards the OAuth API. You find them in the OAuth provider's developer portal. While obtaining them, the OAuth provider should ask you to specify a **Callback URL**, which is `http://localhost:3003/oauth/callback` (if running Nango locally) or `SERVER_URL/oauth/callback` (if using Nango Cloud).

3.  Look up the **scopes** (aka permissions) you want to request from users. Scopes are specific to individual OAuth providers, so you should look them up in the OAuth provider's API documentation.

4.  Finally, decide on a **unique key** for you provider configuration. If you only have one configuration per API provider, we recommend you use the API's name in all lowercase, e.g. `github` for GitHub, `salesforce` for Salesforce etc.

With this information you are now ready to configure & enable your first OAuth provider:

```bash
npx nango config:create <unique-config-key-from-4> <template-name-from-1> <cliend-id-from-2> <client-secret-from-2> <scopes-from-2>
# e.g. for github: npx nango config:create github github <some-id> <some-secret> "comma,separated,scopes,with,quotes"
```

Now run `npx nango config:list` and you should see your freshly added config 🎉

:::tip
Run `npx nango` to display all available CLI commands + help.
:::

## Step 3: Trigger the OAuth flow (frontend)

For quick testing you can call Nango directly from within a `<script>` tag on your page:

```html
<script type="module">
    import Nango from 'https://unpkg.com/@nangohq/frontend/dist/index.js';

    var nango = new Nango('http://localhost:3003'); // Local
    // or
    var nango = new Nango('Server URL'); // Nango Cloud

    //... see below
</script>
```

For single page apps, install the `@nangohq/frontend` package:

```ts
import Nango from '@nangohq/frontend';
```

Trigger a user OAuth flow:

```ts
var nango = new Nango('http://localhost:3003'); // Local
// or
var nango = new Nango('Server URL'); // Nango Cloud

// Trigger an OAuth flow
// Param 1: unique config key from Step 2 (bullet 4)
// Param 2: ID you will use to retrieve the connection (most often the user ID)
nango
    .auth('github', '<connection-id>')
    .then((result) => {
        console.log(`OAuth flow succeeded for provider "${result.providerConfigKey}" and connection-id "${result.connectionId}"!`);
    })
    .catch((error) => {
        console.error(`There was an error in the OAuth flow for integration: ${error.message}`);
    });
```

With the frontend part ready, you should now be able to run a full OAuth flow from your app while Nango will retrieve, store and refresh tokens automatically. Go ahead & try it! 🙌

## Step 4: Retrieve tokens (backend)

The last step is to retrieve fresh access tokens whenever you need to make authenticated API requests on behalf of users.

:::info
Many OAuth providers provide short-lived access tokens (30-60 minutes). Nango refreshes them automatically for you, but it is important you always request the access token right before each API call. Otherwise you may work with a stale token that has been revoked and your API call will fail.
:::

Nango offers a couple ways to retrieve fresh access tokens:

-   **Backend SDKs**: easiest way if an SDK is available for your language (currently only Node, others coming soon)
-   **REST API**: equivalent fallback option if no SDK is available for your language
-   **CLI**: convenient for testing & development

In all cases, you need to tell Nango two things to get the access token:

-   The **Provider Config Key**, which identifies the OAuth provider configuration (from Step 2, bullet 4)
-   The **Connection ID**, which identifies the connection containing the access token (from Step 3)

### Node SDK {#node-sdk}

Install the SDK with

```bash
npm i -S @nangohq/node
```

Retrieve access tokens:

```ts
import { Nango } from '@nangohq/node';

let nango = new Nango('http://localhost:3003'); // Local
// or
let nango = new Nango('Server Url', 'Secret Key'); // Nango Cloud

let accessToken = await nango.getToken('<config-key>', '<connection-id>'); // Token
//or
let connection = await nango.getConnection('<config-key>', '<connection-id>'); // Token + Connection info
```

❗️If using [Nango Cloud](cloud), you should use env variables for your `Server Url` and `Secret Key`.

### REST API {#rest-api}

Your can test the Nango API endpoint to retrieve connections & tokens:

```bash
# Local
curl -XGET 'http://localhost:3003/connection/<connection-id>?provider_config_key=<config-key>'

# Nango Cloud
curl -XGET 'SERVER_URL/connection/<connection-id>?provider_config_key=<config-key>' -H 'Authorization: Basic <encodeInBase64(secret + ":")>' # Notice the ':' character appended to the Secret before encoding!
```

### CLI

For development convenience, use the CLI to retrieve connections and tokens:

```bash
npx nango token:get <connection-id> <unique-config-key> # Token
npx nango connection:get <connection-id> <unique-config-key> # Token + Connection info
npx nango connection:list # All Connections
```

## Need help?

If you run into any trouble whilst setting up Nango or have any questions please do not hesitate to contact us - we are happy to help!

Please join our [Slack community](https://nango.dev/slack), where we are very active, and we will do our best to help you fast.
