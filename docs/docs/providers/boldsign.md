---
sidebar_label: Boldsign
---

# Boldsign API wiki

:::note Working with the Boldsign API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/boldsign.md).

:::

## Using Boldsign with Nango

API template name in Nango: `boldsign`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Boldsign in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developers.boldsign.com/authentication/OAuth-2.0#acquire-app-credentials)

## Useful links

-   [How to register an Application](https://developers.boldsign.com/authentication/OAuth-2.0#acquire-app-credentials)
-   [OAuth-related docs](https://developers.boldsign.com/authentication/introduction)
-   [List of OAuth scopes](https://developers.boldsign.com/authentication/introduction#scopes)
-   [Web API docs (their REST API)](https://developers.boldsign.com/documents)

## API specific gotchas

-   You will be able to get refresh tokens only if you add `offline_access` in the list of scopes.
