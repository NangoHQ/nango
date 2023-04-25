---
sidebar_label: Timely
---

# Timely API wiki

:::note Working with the Timely API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/timely.md).

:::

## Using Timely with Nango

Provider template name in Nango: `timely`
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Timely in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**

-   You need to be the administrator of a [Timely account](https://app.timelyapp.com) to register an app (under Settings -> Devs).
-   Registering an app takes only a few minutes and you can start building immediately.
-   You can use the free trial account to register an app. oAuth apps work even after trial expires.

## Useful links

-   [Getting started with the Timely API](https://support.timelyapp.com/en/articles/5169847-getting-started-with-timely-s-api)
-   [Web API docs (their REST API)](https://dev.timelyapp.com)

## API specific gotchas

-   Redirect URI on localhost has some issues on non-standard ports. Use `https://redirectmeto.com/http://localhost:3003/oauth/callback` as the redirect URL to get around this.
-   `scope` is not supported. Set `scopes` to whitespace (` `) when configuring provider in Nango's UI.
