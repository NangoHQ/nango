---
sidebar_label: 'Quickstart 🚀'
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Quickstart: Add Nango to your app

:::tip
Just want to see Nango in Action? Check out our [1min demo video](introduction.md#demo)
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

After signing up, open the [dashboard](https://app.nango.dev/integrations).

  </TabItem>
  <TabItem value="localhost" label="Localhost">
    You can try Nango on your local machine with docker compose:

```bash
git clone https://github.com/NangoHQ/nango.git && cd nango
docker compose up # Keep the tab open
```

In the case you are already using port 5432 on your local machine, you can use

```bash
git clone https://github.com/NangoHQ/nango.git && cd nango
NANGO_DB_PORT=2345 docker compose up # Keep the tab open
```

Once Nango is running locally, open the [dashboard](http://localhost:3003/) in your browser.

  </TabItem>
  <TabItem value="self-hosted" label="Self-hosted">

You can self-host Nango on a single machine with our docker images. Check the [Nango Self Hosted](/category/deploy-nango-self-hosted) page for a list of all providers, or use these 1-click deploy options:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/NangoHQ/nango-render)
<a href="https://heroku.com/deploy?template=https://github.com/NangoHQ/nango-heroku">
<img src="https://www.herokucdn.com/deploy/button.svg" alt="Deploy to heroku" width="200"/>
</a>

Once Nango is running on your instance, open the dashboard at `https://<INSTANCE-URL>:3003`.

  </TabItem>
</Tabs>

## Step 2: Configure your API/Integration

Click the "Add New" button on the dashboard's `Integrations` page, it will ask for you for 4 things:

1. Find your Provider/API in the dropdown.

2. Decide what this config should be called in Nango, we call this the `<CONFIG-KEY>` here and the UI calls it the "Unique Key". Most people pick the same name as the API, e.g. `github`.

3. Create an OAuth app on your Provider's developer portal. Obtain the client id & client secret (sometimes also called app id and app secret or similar) and add them.

4. You should also get a list of scopes you want to request. Prepare them in a comma separated list: `scope1,scope2,scope3` (no matter what the provider tells you, Nango will reformat them) and add them to the Scopes field.

Click "Save" and you are ready to trigger your first OAuth flow!

## Step 3: Trigger the OAuth flow from the frontend

To trigger an OAuth flow in your frontend use our frontend SDK.

<Tabs groupId="deployment" queryString>
  <TabItem value="cloud" label="Nango Cloud">

You will need the `Public Key` from your [Dashboard's project settings](https://app.nango.dev/project-settings) and the `<CONFIG-KEY>` from the last step.

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

If you are using server side rendering (SSR) with NextJS, [use this workaround](https://github.com/NangoHQ/nango/issues/335#issuecomment-1431757714).

With the frontend part ready, you should now be able to run a full OAuth flow from your app while Nango will retrieve, store and refresh tokens automatically.

Go ahead & try it! 🙌

## Step 4: Obtain the access token from the backend

There are a few different way in which you can obtain access tokens from Nango. The dashboard is great for testing, but in your app we recommend using the [node SDK](reference/node-sdk.md) or the [Connections REST API](reference/connections-api.md).

:::info
**Make sure you always have a fresh access token**  
Many OAuth providers provide short-lived access tokens (30-60 minutes). Nango refreshes them automatically for you, but it is important that you always request the access token right before each API call. Otherwise you may work with a stale token that has been revoked and your API call will fail.
:::

### Dashboard

Find the Connection in your dashboard's `Connections` page. Click "View" to see the current access token and details.

### Backend SDK

If you work with Node, Nango offers a [Node SDK](reference/node-sdk.md) to retrieve tokens (more languages coming).

<Tabs groupId="deployment" queryString>
  <TabItem value="cloud" label="Nango Cloud">

You will need the `Secret Key` from your [Dashboard's project settings](https://app.nango.dev/project-settings).

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

You can also use the Nango [Connections REST API](reference/connections-api.md) to retrieve connection details & the current access token:

<Tabs groupId="deployment" queryString>
  <TabItem value="cloud" label="Nango Cloud">

You will need the `Secret Key` from your [Dashboard's project settings](https://app.nango.dev/project-settings).

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
