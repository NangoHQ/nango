---
sidebar_label: Proxy
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Proxy: Authenticate and make API calls

:::tip
Make sure you have gone through the [quickstart](/quickstart) before using the proxy!
:::

# What Is It?
Same familiar simple interface with a lot of functionality baked in:
1. Handles authentication
2. Handles retries
3. Takes care of logging
4. Handles rate limits
5. Scales as you scale

```
const repsonse = await nango.proxy({
    endpoint: '/user',
    providerConfigKey: 'XXX',
    connectionId: 'XXX'
});
```

## SDK Usage

1. Install and set up the SDK as described in [the sdk docs](/reference/node-sdk)
2. Use the proxy to both authenticate and make an API call in one simple step
```js
# note these params closely follows how axios structures their API
const response = await nango.proxy({
    method: '<HTTP-METHOD>',    // GET is the default if not provided
    endpoint: '<API-ENDPOINT>', // exclude the base API URL
    providerConfigKey: '<PROVIDER-CONFIG-KEY>',
    connectionId: '<CONNECTION-ID>',

    // optional parameters
    headers: '<HEADERS>',
    params: '<PARAMS>',   // URL parameters to be sent with the request. Must be a plain object or a URLSearchParams object
    paramsSerializer: {
        encode?: (param: string): string => { /* Do custom ops here and return transformed string */ }, // custom encoder function; sends Key/Values in an iterative fashion
        serialize?: (params: Record<string, any>, options?: ParamsSerializerOptions ), // mimic pre 1.x behavior and send entire params object to a custom serializer func. Allows consumer to control how params are serialized.
        indexes: false // array indexes format (null - no brackets, false (default) - empty brackets, true - brackets with indexes)
      },
    data: {
        param: 'VALUE'
    }
});
```

### Example
```js
const insertCalendarListResponse = await nango.proxy({
    method: 'POST',
    endpoint: '/users/me/calendarList',
    providerConfigKey: '<PROVIDER-CONFIG-KEY>',
    connectionId: '<CONNECTION-ID>',
    data: {
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
curl -H 'Authorization: Bearer <SECRET-KEY>' \
'https://api.nango.dev/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>'

curl -X POST -H 'Content-Type: application/json' \
-H 'Authorization: Bearer <SECRET-KEY>' \
-d '{"id": 1, "colorId: "blue"}' \
'https://api.nango.dev/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>

curl -X PATCH -H 'Content-Type: application/json' \
-H 'Authorization: Bearer <SECRET-KEY>' \
-d '{"id": 1, "colorId: "blue"}' \
'https://api.nango.dev/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>

curl -X PUT -H 'Content-Type: application/json' \
-H 'Authorization: Bearer <SECRET-KEY>' \
-d '{"id": 1, "colorId: "blue"}' \
'https://api.nango.dev/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>

curl -X DELETE -H 'Authorization: Bearer <SECRET-KEY>' \
'https://api.nango.dev/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>/<DELETE-RESOURCE-ID>'
```

  </TabItem>
  <TabItem value="localhost" label="Localhost">

```bash
curl 'http://localhost:3003/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>'

curl -X POST -H 'Content-Type: application/json' \
-d '{"id": 1, "colorId: "blue"}' \
'http://localhost:3003/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>

curl -X PATCH -H 'Content-Type: application/json' \
-H 'Authorization: Bearer <SECRET-KEY>' \
-d '{"id": 1, "colorId: "blue"}' \
'http://localhost:3003/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>

curl -X PUT -H 'Content-Type: application/json' \
-H 'Authorization: Bearer <SECRET-KEY>' \
-d '{"id": 1, "colorId: "blue"}' \
'http://localhost:3003/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>

curl -X DELETE -H 'Authorization: Bearer <SECRET-KEY>' \
'http://localhost:3003/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>
```

  </TabItem>
  <TabItem value="self-hosted" label="Self-hosted">

```bash
curl '<NANGO-HOST-AND-PORT>/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>'
curl -X POST -H 'Content-Type: application/json' \
-d '{"id": 1, "colorId: "blue"}' \
'<NANGO-HOST-AND-PORT>/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>

curl -X PATCH -H 'Content-Type: application/json' \
-H 'Authorization: Bearer <SECRET-KEY>' \
-d '{"id": 1, "colorId: "blue"}' \
'<NANGO-HOST-AND-PORT>/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>

curl -X PUT -H 'Content-Type: application/json' \
-H 'Authorization: Bearer <SECRET-KEY>' \
-d '{"id": 1, "colorId: "blue"}' \
'<NANGO-HOST-AND-PORT>/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>

curl -X DELETE -H 'Authorization: Bearer <SECRET-KEY>' \
'<NANGO-HOST-AND-PORT>/proxy/<CONNECTION-ID>?provider_config_key=<CONFIG-KEY>&endpoint=<API-ENDPOINT>
```

  </TabItem>
</Tabs>
