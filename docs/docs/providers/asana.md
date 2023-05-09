---
sidebar_label: Asana
---

# Asana API wiki

:::note Working with the Asana API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/asana.md).

:::

## Using Asana with Nango

API template name in Nango: `asana`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Asana in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                                           |
| ---------------------------------- | --------------------------------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                                                  |
| [Proxy](/nango-unified-apis/proxy) | ❎                                                  |
| Unified APIs                       | [Ticketing](/nango-unified-apis/ticketing/overview) |

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developers.asana.com/docs/oauth#register-an-application)

## Useful links

-   [How to register an Application](https://developers.asana.com/docs/oauth#register-an-application)
-   [OAuth-related docs](https://developers.asana.com/docs/oauth)
-   [List of OAuth scopes](https://developers.asana.com/docs/oauth#oauth-scopes)
-   [Web API docs (their REST API)](https://developers.asana.com/nango-auth/rest-api-reference)

## API specific gotchas

-   To refresh the token simple use `nango.getToken()` to generate new set of tokens
