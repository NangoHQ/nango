---
sidebar_label: Strava
---

# Strava API wiki

:::note Working with the Strava API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/strava.md).

:::

## Using Strava with Nango

API template name in Nango: `strava`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Strava in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developers.strava.com/docs/getting-started/#account)

## Useful links

-   [How to register an Application](https://developers.strava.com/docs/getting-started/#account)
-   [OAuth-related docs](https://developers.strava.com/docs/authentication)
-   [List of OAuth scopes](https://developers.strava.com/docs/authentication/#:~:text=is%20auto.-,scope,-required%20string%2C%20in)
-   [Web API docs (their REST API)](https://developers.strava.com/playground)

## API specific gotchas

-   When adding the callback URL to Strava, you only have to add the domain of the URL and not the complete URL path.
