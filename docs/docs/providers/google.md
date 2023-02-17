---
sidebar_label: Google
---

# Google API wiki

:::note Working with the Google API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/google-mail.md).
:::

## Using Google with Nango

Provider template name in Nango: `google`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Google in 5 minutes.

## App registration & publishing

_No information yet, feel free to contribute it (or check out [airtable](airtable.md) for an example)_

## Useful links

-   [Google access token specs](https://cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token#response-body)
-   [Google scopes](https://developers.google.com/identity/protocols/oauth2/scopes)

## API specific gotchas

-   Google has a unified OAuth system for their various APIs. This provider should work for most of them (e.g. GSheet, Gmail, Google Calendar, etc.)
-   You need to enable individual Google API on the [Google API Console](https://console.cloud.google.com/apis/dashboard) before using them
-   While setting up the OAuth credentials, the _Authorized JavaScript origins_ should be your site URL (`http://localhost:8000` if you're doing the [Quickstart](../quickstart.md) locally)
