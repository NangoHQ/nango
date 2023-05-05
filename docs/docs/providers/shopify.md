---
sidebar_label: Shopify
---

# Shopify API wiki

:::note Working with the Shopify API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/shopify.md).

:::

## Using Shopify with Nango

API template name in Nango: `shopify`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Shopify in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

Make sure you [read this](../nango-auth/frontend-sdk.md#connection-config) to set the correct shop subdomain before starting an OAuth flow for Shopify.

## App registration & publishing

_No information yet, feel free to contribute it (or check out [airtable](airtable.md) for an example)_

## Useful links

_No links yet, feel free to contribute it (or check out [airtable](airtable.md) for an example)_

## API specific gotchas

-   You are required to pass in the correct subdomain before starting an OAuth flow (cf. [Connection configuration](../nango-auth/frontend-sdk.md#connection-config)).
