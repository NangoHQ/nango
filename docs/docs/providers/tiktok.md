---
sidebar_label: TikTok
---

# TikTok API wiki

:::note Working with the TikTok API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/tiktok.md).

:::

## Using TikTok with Nango

Provider template name in Nango: `tiktok`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with TikTok in 5 minutes.

## App registration & publishing

[Register your app here](https://developers.tiktok.com/apps) and follow [these steps](https://developers.tiktok.com/doc/scopes-overview/) to enable the API and add the scopes you need.

You need to submit your app for review (see developer docs) before it is publicly available.

## Useful links

-   [TikTok API Docs](https://developers.tiktok.com/doc/overview/)
-   [Full list of OAuth scopes](https://developers.tiktok.com/doc/tiktok-api-scopes/)

## API specific gotchas

-   The TikTok "App Id" is _not_ the `client_id`. TikTok calls the `client_id` the Client key and you should pass this value to Nango as the `client_id`.
-   Make sure you pre-register your scopes in your app's config, otherwise the flow will fail when you ask for them.
