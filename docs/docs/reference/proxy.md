---
sidebar_label: Proxy
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Proxy: Authenticate and make API calls

:::tip
Make sure you have gone through the [quickstart](/quickstart) before using the proxy!
:::

## SDK Usage

1. Install and set up the SDK as described in [the sdk docs](/reference/node-sdk)
2. Use the proxy to both authenticate and make an API call in one simple step
```js
const response = await nango.proxy({
    providerConfigKey: '<PROVIDER-CONFIG-KEY>',
    connectionId: '<CONNECTION-ID>',
    method: '<HTTP-METHOD>',
    endpoint: '<API-ENDPOINT>', // exclude the base API URL
    headers: '<HEADERS>', // optional
    body: {               // optional
        param: 'VALUE'
    }
});
```

### Example
```js
const insertCalendarListResponse = await nango.proxy({
    providerConfigKey: '<PROVIDER-CONFIG-KEY>',
    connectionId: '<CONNECTION-ID>',
    method: 'POST',
    endpoint: 'users/me/calendarList',
    body: {
        id: 1,
        colorId: 'blue',
        selected: true
    }
});
```

## REST API Usage

<Tabs groupId="deployment" queryString>
  <TabItem value="cloud" label="Nango Cloud">

```bash
curl 'https://api.nango.dev/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&method=<METHOD>&endpoint=<API-ENDPOINT>'\
-H 'Authorization: Bearer <SECRET-KEY>'
```

  </TabItem>
  <TabItem value="localhost" label="Localhost">

```bash
curl 'http://localhost:3003/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&method=<METHOD>&endpoint=<API-ENDPOINT>'
```

  </TabItem>
  <TabItem value="self-hosted" label="Self-hosted">

```bash
curl '<NANGO-HOST-AND-PORT>/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&method=<METHOD>&endpoint=<API-ENDPOINT>'
```

  </TabItem>
</Tabs>


# Why Proxy?
Allows you to just write a single line of code that then:
1. Handles authentication
2. Handles retries
3. Takes care of logging
4. Handles rate limits
5. Scales as you scale

