# Step-by-step guide

This setup will take about **15-20 minutes**.

## Step 1: Start the Nango server
The first step is to start the Nango server locally or use [Nango Cloud](cloud.md).

For this guide we will stick to a local deployment:
```bash
git clone https://github.com/NangoHQ/nango.git && cd nango 
docker compose up
```

## Step 2: Configure a provider (CLI)

To run OAuth flows from your application you need to setup each provider that you want to use. For this you will need a few things from the OAuth provider/API:
- First **find the template name** for the API you are looking to integrate with from our [list of pre-configured APIs](https://nango.dev/oauth-providers). Usually this is the name of the API in lowercase, e.g. `github`, `asana`, `linkedin` etc.
- **Client id** and **client secret**, these identify your application towards the API that offers the OAuth. You need to get these from the API/OAuth provider. Usually you will find them in their developer portal.
- The **scopes** you want to request from the user: These will also depend on the API, you can usually find a list of all scopes an API offers in the API documentation.
    - For the CLI commend below your scopes must be comma separated, e.g. `read,write` (no matter what format the API expects)
- The OAuth provider should ask you for a callback URL. For Nango the callback URL is always `[NANGO_SERVER_URL]/oauth/callback`, so if Nango runs on your local machine the callback URL is `http://localhost:3003/oauth/callback`
- Finally, you need to decide on a **provider config key**. This key will uniquely identify your configuration within Nango. If you only have one configuration per API provider we recommend you use the API's name in all lowercase, e.g. `github` for GitHub, `salesforce` for Salesforce etc.

With this information you are now ready to configure & enable your first OAuth provider. Here we setup a GitHub config as an example:
```bash
npx nango config:create github github <client-id> <client-secret> "<scopes>"
```

Now run `npx nango config:list` and you should see your freshly added config 🎉

:::tip
Run `npx nango` to show the CLI help menu
:::

## Step 3: Trigger the OAuth flow (frontend)

For quick testing you can call Nango directly from within a `<script>` tag on your page: 
```html
<script type="module">
    import Nango from 'https://unpkg.com/@nangohq/frontend/dist/index.js';

    var nango = new Nango('http://localhost:3003');
    //... see below
</script>
```

For single page apps where you bundle your Javascript/Typescript files we recommend you install the `@nangohq/frontend` package:
```ts
import Nango from '@nangohq/frontend';
```

Trigger a user OAuth flow:
```ts
var nango = new Nango('http://localhost:3003'); // or whatever host/port of your Nango server

// Trigger an OAuth flow
// The first parameter is the config key you set up in step 2
// The second parameter is the ID you will use to retrieve the connection (most often the user ID)
nango.auth('github', '<connection-id>')
.then((result) => { 
    console.log(`OAuth flow succeeded for provider "${result.providerConfigKey}" and connection-id "${result.connectionId}"!`);
})
.catch((error) => {
    console.error(`There was an error in the OAuth flow for integration: ${error.message}`);
});
```

With the frontend part setup you should now be able to run a full OAuth flow from your app. Go ahead & try it! 🙌

## Step 4: Retrieve tokens (backend)

The last step is to get a fresh access token in your backend whenever you need to make an authenticated API request for the user.

Why fresh?  
Increasingly OAuth providers are providing access tokens with a limited lifetime of e.g. 30-60 minutes. After this time the token expires and needs to be exchanged for a fresh token. Nango handles this exchange transparently for you, but it is important you always request the access token just prior to each API call. Otherwise you may work with a stale token that has been revoked and your API call will fail.

Nango offers two ways to get a fresh access token:
- With a **backend SDK**: This is the easiest and preferred way if an SDK is available for your language (currently only Node, others coming soon).
- With a **REST API**: This is the fallback option if no SDK is available for your language.

In both cases you need to tell Nango two things to get the access token:
- The **provider config key**, which identifies the OAuth provider configuration
- The **connection ID**, which identifies the connection containing the access token

### Node SDK {#node-sdk}
Install the SDK with
```bash
npm i -S @nangohq/node
```

Retrieve access tokens:
```ts
import { Nango } from '@nangohq/node'

let nango = new Nango('http://localhost:3003'); // or whatever host/port of your Nango server

let accessToken = await nango.getToken('<config-key>', '<connection-id>');
```

### Getting an access token - REST API {#rest-api}
The api endpoint is located at `[NANGO_SERVER_URL]/connection/<connection-id>?provider_config_key=<config-key>`.  

Here is an example curl command for Nango running on your local machine:
```bash
curl -XGET -H "Content-type: application/json" \
'http://localhost:3003/connection/<connection-id>?provider_config_key=<config-key>'
```

## Need help?

If you run into any trouble whilst setting up Nango or have any questions please do not hesitate to contact us -  we are happy to help!

Please join our [Slack community](https://nango.dev/slack), where we are very active, and we will do our best to help you fast.

