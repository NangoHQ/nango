---
sidebar_label: YouTube
---

# YouTube API wiki

:::note Working with the YouTube API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/youtube.md).

:::

## Using YouTube with Nango

YouTube uses the same OAuth mechanism as other Google services. Please use the Google template for it in Nango: `google`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with YouTube in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

Google's APIs all use the same OAuth service. To which APIs you get access is determined by the scopes that you request.

Please check the main [Google OAuth API wiki](google.md) here for details on how to register an OAuth app with Google.

## Useful links

-   [YouTube Data API reference](https://developers.google.com/youtube/v3/docs)
-   [YouTube Analytics and Reporting API](https://developers.google.com/youtube/analytics)
-   [YouTube Data API OAuth scopes](https://developers.google.com/identity/protocols/oauth2/scopes#youtube)
-   [YouTube Analytics API OAuth scopes](https://developers.google.com/identity/protocols/oauth2/scopes#youtubeanalytics)
-   [YouTube Reporting API OAuth scope](https://developers.google.com/identity/protocols/oauth2/scopes#youtubereporting)

## API specific gotchas

_No gotchas yet, feel free to contribute it (or check out [airtable](airtable.md) for an example)_
