---
sidebar_label: 'Quickstart 🚀'
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Quickstart: Add Nango to your app

:::tip
Just want to see Nango in Action? Check out our [1 minute demo video](introduction.md#demo)
:::

Follow these 4 steps to run OAuth flows with Nango in your app in 15 minutes.

## Step 1: Get your Nango instance ready

The easiest and fastest way to get a production ready Nango instance is with Nango Cloud.

<Tabs groupId="deployment" queryString>
  <TabItem value="cloud" label="Nango Cloud">
    Sign up for a Nango Cloud (no credit card required):
    <br/>
    <a href="https://app.nango.dev/signup" style={{cursor: 'pointer'}}>
      <img src="https://raw.githubusercontent.com/NangoHQ/nango/6f49ab92c0ffc18c1d0f44d9bd96c62ac97aaa8d/docs/static/img/nango-deploy-button.svg" alt="Try Nango Cloud" width="215" style={{marginTop: 10+'px'}}/>
    </a>
<br /><br />

In your terminal open your `.bashrc`/`.zshrc` (or equivalent) and add:

```bash
export NANGO_HOSTPORT=https://api.nango.dev
export NANGO_SECRET_KEY=<SECRET-KEY>  # Replace with your Secret Key
```

Restart your terminal. Then run this Nango CLI command to make sure you can connect to Nango Cloud (NPX will automatically install the Nango CLI):

```bash
npx nango config:list
```

If all is good you should see an empty list of configurations.

  </TabItem>
  <TabItem value="localhost" label="Localhost">
    You can try Nango on your local machine with docker compose:

```bash
git clone https://github.com/NangoHQ/nango-quickstart.git && cd nango-quickstart
docker compose up # Keep the tab open
```

Then run this Nango CLI command to make sure you can connect to Nango Cloud (NPX will automatically install the Nango CLI):

```bash
npx nango config:list
```

If all is good you should see an empty list of configurations.

  </TabItem>
  <TabItem value="self-hosted" label="Self-hosted">

You can self-host Nango on a single machine with our docker images. Check the [Nango Self Hosted](/category/deploy-nango-self-hosted) page for a list of all providers, or use these 1-click deploy options:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/NangoHQ/nango-render)
<a href="https://heroku.com/deploy?template=https://github.com/NangoHQ/nango-heroku">
<img src="https://www.herokucdn.com/deploy/button.svg" alt="Deploy to heroku" width="200"/>
</a>

Once you have setup your instance [configure the Nango CLI](nango-deploy/oss-instructions.md#cli) and return here.

  </TabItem>
</Tabs>

## Step 2: Configure your API/OAuth Provider

1. Find your Provider in our [provider list](/providers). The template name (e.g. `github`) is later referenced as `<TEMPLATE>`.

2. Create an OAuth app on your Provider's developer portal. Obtain the app ID & secret, later referenced as `<APP-ID>` and `<APP-SECRET>`.

3. You should also get a list of scopes you want to request. Prepare them in a comma separated list: `"scope1,scope2,scope3"` (later referenced as `<SCOPES>`).

4. Decide what this config should be called in Nango, referenced as `<CONFIG-KEY>`.

Now add a new provider configuration with the Nango CLI:

```bash
npx nango config:create <CONFIG-KEY> <TEMPLATE> <APP-ID> <APP-SECRET> <SCOPES>
# e.g. for github: npx nango config:create github github some-id some-secret "comma,separated,scopes,with,quotes"
```

You should see a success message. To check if it worked you can run `npx nango config:list`

## Step 3: Trigger the OAuth flow from the frontend

To trigger an OAuth flow in your frontend use our frontend SDK.

<Tabs groupId="deployment" queryString>
  <TabItem value="cloud" label="Nango Cloud">

You will need the `Public Key` from your [Dashboard](https://app.nango.dev/) and the `<CONFIG-KEY>` from the last step.

```js
import Nango from 'https://unpkg.com/@nangohq/frontend/dist/index.js'; // For quick testing
// or
import Nango from '@nangohq/frontend'; // After installing the npm package

var nango = new Nango({ publicKey: '<PUBLIC-KEY>' });

// Trigger an OAuth flow
// Param 1: config key from Step 2 (bullet 4)
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

  </TabItem>
  <TabItem value="localhost" label="Localhost">

```js
import Nango from 'https://unpkg.com/@nangohq/frontend/dist/index.js'; // For quick testing
// or
import Nango from '@nangohq/frontend'; // After installing the npm package

var nango = new Nango({ host: 'http://localhost:3003' });

// Trigger an OAuth flow
// Param 1: config key from Step 2 (bullet 4)
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

  </TabItem>
  <TabItem value="self-hosted" label="Self-hosted">

```js
import Nango from 'https://unpkg.com/@nangohq/frontend/dist/index.js'; // For quick testing
// or
import Nango from '@nangohq/frontend'; // After installing the npm package

var nango = new Nango({ host: '<NANGO-HOST-AND-PORT>' });

// Trigger an OAuth flow
// Param 1: config key from Step 2 (bullet 4)
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

  </TabItem>
</Tabs>

With the frontend part ready, you should now be able to run a full OAuth flow from your app while Nango will retrieve, store and refresh tokens automatically.

Go ahead & try it! 🙌

## Step 4: Obtain the access token from the backend

There are a few different way in which you can obtain access tokens from Nango. The CLI is great for testing, but in your app we recommend using the SDK or the REST API.

:::info
**Make sure you always have a fresh access token**  
Many OAuth providers provide short-lived access tokens (30-60 minutes). Nango refreshes them automatically for you, but it is important that you always request the access token right before each API call. Otherwise you may work with a stale token that has been revoked and your API call will fail.
:::

### CLI

To obtain an access token use this command:

```bash
npx nango token:get <CONFIG-KEY> <CONNECTION-ID>
```

### Backend SDK

If you work with Node, Nango offers a backend SDK to retrieve tokens (more languages coming).

<Tabs groupId="deployment" queryString>
  <TabItem value="cloud" label="Nango Cloud">

You will need the `Secret Key` from your [Dashboard](https://app.nango.dev/).

```js
import { Nango } from '@nangohq/node';

let nango = new Nango({ secretKey: '<SECRET-KEY>' });

let accessToken = await nango.getToken('<CONFIG-KEY>', '<CONNECTION-ID>');
```

  </TabItem>
  <TabItem value="localhost" label="Localhost">

```js
import { Nango } from '@nangohq/node';

let nango = new Nango({ host: 'http://localhost:3003' });

let accessToken = await nango.getToken('<CONFIG-KEY>', '<CONNECTION-ID>');
```

  </TabItem>
  <TabItem value="self-hosted" label="Self-hosted">

```js
import { Nango } from '@nangohq/node';

let nango = new Nango({ host: '<NANGO-HOST-AND-PORT>' });

let accessToken = await nango.getToken('<CONFIG-KEY>', '<CONNECTION-ID>');
```

  </TabItem>
</Tabs>

### REST API

You can use the Nango REST API to retrieve connection details & the current access token:

<Tabs groupId="deployment" queryString>
  <TabItem value="cloud" label="Nango Cloud">

You will need the `Secret Key` from your [Dashboard](https://app.nango.dev/).

```bash
curl 'https://api.nango.dev/connection/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>'\
-H 'Authorization: Bearer <SECRET-KEY>'
```

  </TabItem>
  <TabItem value="localhost" label="Localhost">

```bash
curl 'http://localhost:3003/connection/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>'
```

  </TabItem>
  <TabItem value="self-hosted" label="Self-hosted">

```bash
curl '<NANGO-HOST-AND-PORT>/connection/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>'
```

  </TabItem>
</Tabs>

## Need help?

If you run into any trouble whilst setting up Nango or have any questions please do not hesitate to contact us - we are happy to help!

Please join our [Slack community](https://nango.dev/slack), where we are very active, and we will do our best to help you fast.
