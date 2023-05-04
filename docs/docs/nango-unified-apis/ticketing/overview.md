import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Nango unified Ticketing API

The Nango unified ticketing API lets you access data on tickets from different systems in a single, common model.

:::info
**Missing a model or external API?**  
Please drop us a note on the [Slack community](https://nango.dev/slack): Our unified APIs are under heavy development and continuously expand. We are happy to prioritize the models and external APIs that you need.
:::

## Supported Models

The unified ticketing API currently gives you access to the following objects (called "models" in Nango):

-   **[Ticket](tickets):** Represents a ticket in the external system (e.g. JIRA issue, Asana task or GitHub issue)
-   **[Comment](comments):** Represents a comment on a ticket in the external system

## Supported external APIs

Currently the Nango unified ticketing API supports the following external APIs:

-   [GitHub](/providers/github)
-   [JIRA](/providers/atlassian)
-   [Asana](/providers/asana)
-   [ClickUp](/providers/clickup)
-   [Gitlab](/providers/gitlab)

## Querying data from the unified API

You can either use our fully typed SDKs or the REST API.

<Tabs groupId="sdk" queryString>
  <TabItem value="node" label="Node SDK">

First, instanstiate the Nango node SDK:

```ts
import { Nango } from '@nangohq/node';

let nango = new Nango({ secretKey: '<SECRET-KEY>' });
```

Get all the tickets:

```js
let tickets = await nango.ticketing.getTickets('<USER-TOKEN>');
```

Get the comments for a ticket:

```ts
let comments = await nango.ticket.getComments('<TICKET-ID>');
```

  </TabItem>
  <TabItem value="rest" label="REST API">

Get all the tickets:

```sh
curl -H 'Authorization: Bearer <SECRET-KEY>' \
-H 'User-Token: <USER-TOKEN>' \
'https://api.nango.dev/unified-apis/ticketing/tickets'
```

Get all the comments for a ticket:

```sh
curl -H 'Authorization: Bearer <SECRET-KEY>' \
-H 'User-Token: <USER-TOKEN>' \
'https://api.nango.dev/unified-apis/ticketing/tickets/TICKET-ID/comments'
```

  </TabItem>
</Tabs>
