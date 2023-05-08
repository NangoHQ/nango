---
sidebar_label: WakaTime
---

# WakaTime API wiki

:::note Working with the WakaTime API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/wakatime.md).

:::

## Using WakaTime with Nango

API template name in Nango: `wakatime`
Follow our [quickstart](../quickstart.md) to add an OAuth integration with WakaTime in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few seconds and you can start building immediately: [App registration page](https://wakatime.com/apps)
You don’t need to publish your app, any WakaTime user can install your app.
Only publish if your app will pass a manual quality review.

## Useful links

-   [Web API docs (their REST API)](https://wakatime.com/developers)

## API specific gotchas

-   Access tokens expire after 60 days but can be refreshed with the refresh_token.
