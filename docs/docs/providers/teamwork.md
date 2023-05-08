---
sidebar_label: Teamwork
---

# Teamwork API wiki

:::note Working with the Teamwork API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/teamwork.md).

:::

## Using Teamwork with Nango

API template name in Nango: `teamwork`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Teamwork in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developer.teamwork.com/guides/developer-portal)

## Useful links

-   [How to register an Application](https://developer.teamwork.com/guides/developer-portal)
-   [OAuth-related docs](https://developer.teamwork.com/guides/how-to-authenticate-via-app-login-flow)

## API specific gotchas

-   There are no scopes needed in the authorization, hence you can keep the scope field empty
