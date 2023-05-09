import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Nango unified HRIS API

The Nango unified HRIS API lets you access data on employees from different systems in a single, common model.

:::info
**Missing a model or external API?**  
Please drop us a note on the [Slack community](https://nango.dev/slack): Our unified APIs are under heavy development and continuously expand. We are happy to prioritize the models and external APIs that you need.
:::

## Supported Models

The unified HRIS API currently gives you access to the following objects (called "models" in Nango):

-   **[Employee](employees):** Represents an employee in the external system

## Supported external APIs

Currently the Nango unified ticketing API supports the following external APIs:

-   [BambooHR](/providers/bamboohr)
-   [Gusto](/providers/gusto)
-   [Zenefits](/providers/zenefits)

Coming soon:

-   Rippling
-   Workday
-   Personio

## Querying data from the unified API

You can either use our fully typed SDKs or the REST API.

<Tabs groupId="sdk" queryString>
  <TabItem value="node" label="Node SDK">

First, instanstiate the Nango node SDK:

```ts
import { Nango } from '@nangohq/node';

let nango = new Nango({ secretKey: '<SECRET-KEY>' });
```

Get all the employees:

```js
let tickets = await nango.hris.getEmployees('<USER-TOKEN>');
```

  </TabItem>
  <TabItem value="rest" label="REST API">

Get all the employees:

```sh
curl -H 'Authorization: Bearer <SECRET-KEY>' \
-H 'User-Token: <USER-TOKEN>' \
'https://api.nango.dev/unified-apis/hris/employees'
```

  </TabItem>
</Tabs>
