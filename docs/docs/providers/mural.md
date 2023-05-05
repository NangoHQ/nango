---
sidebar_label: Mural
---

# Mural API wiki

:::note Working with the Mural API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/mural.md).

:::

## Using Mural with Nango

API template name in Nango: `mural`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Mural in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developers.mural.co/public/docs/register-your-app)

## Useful links

-   [How to register an Application](https://developers.mural.co/public/docs/register-your-app)
-   [OAuth-related docs](https://developers.mural.co/public/docs/oauth)
-   [List of OAuth scopes](https://developers.mural.co/public/docs/scopes)
-   [Web API docs (their REST API)](https://developers.mural.co/public/docs)

## API specific gotchas

-   To refresh the token simple use `nango.getToken()` to generate new set of tokens
