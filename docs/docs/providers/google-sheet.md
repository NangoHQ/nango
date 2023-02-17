---
sidebar_label: GSheet
---

# GSheet API wiki

:::note Working with the Google Sheet API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/google-sheet.md).
:::

## Using GSheet with Nango

Provider template name in Nango: `google-sheet`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with GSheet in 5 minutes.

## App registration & publishing

_No information yet, feel free to contribute it (or check out [airtable](airtable.md) for an example)_

## Useful links

-   [GSheet access token specs](https://cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token#response-body)
-   [GSheet scopes](https://developers.google.com/identity/protocols/oauth2/scopes)

## API specific gotchas

-   While setting up the OAuth app, use the `https://www.googleapis.com/auth/spreadsheets` scope for extended capabilities
-   While setting up the OAuth credentials, the _Authorized JavaScript origins_ should be your site URL (`http://localhost:8000` if you're doing the [Quickstart](../quickstart.md) locally)
