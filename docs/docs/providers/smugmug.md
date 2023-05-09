---
sidebar_label: Smugmug
---

# Smugmug API wiki

:::note Working with the Smugmug API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/Smugmug.md).

:::

## Using Smugmug with Nango

API template name in Nango: `Smugmug`
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Smugmug in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few seconds and you can start building immediately: [App registration page](https://api.smugmug.com/api/developer/apply)
You don’t need to publish your app, any Smugmug user can install your app.
Only publish if your app will pass a manual quality review.

## Useful links

-   [Web API docs (their REST API)](https://api.smugmug.com/api/v2/doc)

## API specific gotchas

-   There is no way I could find `scopes` so you could add `access_offile` and it just works
