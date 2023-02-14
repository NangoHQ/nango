# Step-By-Step Guide

In about **15-20 minutes**, let's set up an OAuth integration in your app for any external API.

## Step 0: Initial Configuration {#config}

**If using Nango Cloud:**

If you haven't, [sign up](https://nango.dev/start) and open the signup email you received from Nango.

Now let's configure the CLI for your cloud instance:  
Set two new environment variables in your `.bashrc` (or equivalent) by copy/pasting (❗️replace `<SECRET-KEY>` with the secret key you got from the signup email):

```bash
export NANGO_SECRET_KEY=<SECRET-KEY>
export NANGO_HOSTPORT=https://api.nango.dev
```

❗️Don't forget to restart your terminal to activate the new configuration.

**If running Nango locally or self-hosted:**

Clone and start Nango:

```bash
git clone https://github.com/NangoHQ/nango-quickstart.git && cd nango-quickstart
```

```bash
docker compose up # Keep the tab open
```

## Step 1: Configure a provider

To access an OAuth API, you need a few things from the OAuth provider/API:

1.  Find the **template name** for the OAuth provider from the [list of pre-configured APIs](https://nango.dev/oauth-providers) (usually the name of the API in lowercase, e.g. `github`, `asana`, `linkedin` etc.)

2.  Obtain a **Client ID** and **Client Secret** from the OAuth provider. These credentials identify your application towards the OAuth API. Check the OAuth provider's developer portal, where you registered your application with them.

    -   You will be asked to provide a **Callback URL**. Set it to `http://localhost:3003/oauth/callback` if running Nango locally, or `https://api.nango.dev/oauth/callback` if you are using Nango Cloud.

3.  Look up the **scopes** (aka permissions) you want to request from users. Scopes are specific to individual OAuth providers, so you should look them up in the OAuth provider's API documentation.

4.  Finally, decide on a **unique key** for your provider configuration. If you only have one configuration per API provider, we recommend you use the API's name in all lowercase, e.g. `github` for GitHub, `salesforce` for Salesforce etc.

With this information you are now ready to configure & enable your first OAuth provider:

```bash
npx nango config:create <CONFIG-KEY-FROM-4> <TEMPLATE-NAME-FROM-1> <CLIENT-ID-FROM-2> <CLIENT-SECRET-FROM-2> "<SCOPES-FROM-2>"
# e.g. for github: npx nango config:create github github <GITHUB-APP-ID> <GITHUB-APP-SECRET> "comma,separated,scopes,with,quotes"
```

Now run `npx nango config:list` and you should see your freshly added config 🎉

:::tip
Run `npx nango` to display all available CLI commands + help.
:::

## Step 2: Trigger the OAuth flow (frontend)

In your frontend code, import the Nango frontend SDK:

```ts
import Nango from 'https://unpkg.com/@nangohq/frontend/dist/index.js'; // For quick testing
// or
import Nango from '@nangohq/frontend'; // After installing the npm package
```

Trigger a user OAuth flow:

```ts
var nango = new Nango({ host: 'http://localhost:3003' }); // Local
// or
var nango = new Nango({ publicKey: '<PUBLIC-KEY-FROM-SIGNUP-EMAIL>' }); // Nango Cloud

// Trigger an OAuth flow
// Param 1: unique config key from Step 1 (bullet 4)
// Param 2: ID you will use to retrieve the connection (most often the user ID)
nango
    .auth('<CONFIG-KEY>', '<CONNECTION-ID>')
    .then((result) => {
        console.log(`OAuth flow succeeded for provider "${result.providerConfigKey}" and connection-id "${result.connectionId}"!`);
    })
    .catch((error) => {
        console.error(`There was an error in the OAuth flow for integration: ${error.message}`);
    });
```

With the frontend part ready, you should now be able to run a full OAuth flow from your app while Nango will retrieve, store and refresh tokens automatically. Go ahead & try it! 🙌

## Step 3: Retrieve tokens (backend)

The last step is to retrieve fresh access tokens whenever you need to make authenticated API requests on behalf of users.

:::info
Many OAuth providers provide short-lived access tokens (30-60 minutes). Nango refreshes them automatically for you, but it is important you always request the access token right before each API call. Otherwise you may work with a stale token that has been revoked and your API call will fail.
:::

Nango offers a couple ways to retrieve fresh access tokens:

-   **Backend SDKs**: easiest way if an SDK is available for your language (currently only Node, others coming soon)
-   **REST API**: equivalent fallback option if no SDK is available for your language
-   **CLI**: convenient for testing & development

In all cases, you need to tell Nango two things to get the access token:

-   The **Provider Config Key**, which identifies the OAuth provider configuration (from Step 1, bullet 4)
-   The **Connection ID**, which identifies the connection containing the access token (from Step 3)

### Node SDK {#node-sdk}

Install the SDK with

```bash
npm i -S @nangohq/node
```

Retrieve access tokens:

```ts
import { Nango } from '@nangohq/node';

let nango = new Nango({ host: 'http://localhost:3003' }); // Local
// or
let nango = new Nango({ secretKey: '<SECRET-KEY-FROM-SIGNUP-EMAIL>' }); // Nango Cloud

let accessToken = await nango.getToken('<CONFIG-KEY>', '<CONNECTION-ID>');
```

If using Nango Cloud, you should store the secret in an an environment variable on your backend, to avoid committing it.

### REST API {#rest-api}

Your can test the Nango API endpoint to retrieve connections & tokens:

```bash
# Local
curl 'http://localhost:3003/connection/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>'

# Nango Cloud
curl 'https://api.nango.dev/connection/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>' -H 'Authorization: Bearer <SECRET-KEY-FROM-SIGNUP-EMAIL>'
```

### CLI

For development convenience, use the CLI to retrieve connections and tokens:

```bash
npx nango token:get <CONFIG-KEY> <CONNECTION-ID>
```

## Need help?

If you run into any trouble whilst setting up Nango or have any questions please do not hesitate to contact us - we are happy to help!

Please join our [Slack community](https://nango.dev/slack), where we are very active, and we will do our best to help you fast.
