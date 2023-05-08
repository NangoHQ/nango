---
sidebar_label: Shopify
---

# Shopify API wiki

:::note Working with the Stripe API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/shopify.md).

:::

## Using Calendly with Nango

API template name in Nango: `shopify`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Shopify in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://shopify.dev/docs/apps/auth/oauth/getting-started#step-1-retrieve-client-credentials)



## Useful links

- [How to register an Application](https://shopify.dev/docs/apps/auth/oauth/getting-started#step-1-retrieve-client-credentials)
- [OAuth-related docs](https://shopify.dev/docs/apps/auth/oauth)
- [List of OAuth scopes](https://shopify.dev/docs/api/usage/access-scopes#authenticated-access-scopes)
- [API](https://shopify.dev/docs/api/admin)


## API specific gotchas
- Make sure you [read this](../nango-auth/frontend-sdk.md#connection-config) to set the correct shop subdomain before starting an OAuth flow for Shopify.
