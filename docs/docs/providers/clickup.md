---
sidebar_label: Clickup
---

# Clickup API wiki

:::note Working with the Clickup API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/clickup.md).

:::

## Using Clickup with Nango

API template name in Nango: `clickup`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Clickup in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                                           |
| ---------------------------------- | --------------------------------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                                                  |
| [Proxy](/nango-unified-apis/proxy) | ❎                                                  |
| Unified APIs                       | [Ticketing](/nango-unified-apis/ticketing/overview) |

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://clickup.com/api/developer-portal/authentication#step-1-create-an-oauth-app)



## Useful links

- [How to register an Application](https://clickup.com/api/developer-portal/authentication#step-1-create-an-oauth-app)
- [OAuth-related docs](https://clickup.com/api/developer-portal/authentication#oauth-flow)
- [API](https://clickup.com/api/clickupreference/operation/CreateTaskAttachment/)


## API specific gotchas
- You can leave the scopes empty as scopes are not required during authorization.
