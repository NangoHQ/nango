---
sidebar_label: Google Calendar
---

# Google Calendar API wiki

:::note Working with the Google Calendar API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/main/docs/docs/providers/google-calendar.md).
:::

## Using Google Calendar with Nango

Provider template name in Nango: `google-calendar`  
Follow our [getting started guide](../reference/guide.md) to add an OAuth integration with Google Calendar in 5 minutes.

## App registration & publishing

_No information yet, feel free to contribute it (or check out [airtable](airtable.md) for an example)_

## Useful links

-   [Google Calendar access token specs](https://cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token#response-body)
-   [Google Calendar scopes](https://developers.google.com/identity/protocols/oauth2/scopes)

## API specific gotchas

-   While setting up the OAuth credentials, the _Authorized JavaScript origins_ should be your site URL (`http://localhost:8000` if you're doing the [Quickstart](../quickstart.md) locally)
