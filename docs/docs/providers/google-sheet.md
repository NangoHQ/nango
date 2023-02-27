---
sidebar_label: GSheet
---

# GSheet API wiki

:::note Working with the Google Sheet API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/google-sheet.md).
:::

## Using GSheet with Nango

Google Sheets uses the same OAuth mechanism as other Google services. Please use the Google template for it in Nango: `google`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with the Google Sheets API in 5 minutes.

## App registration & publishing

Google's APIs all use the same OAuth service. To which APIs you get access is determined by the scopes that you request.

Please check the main [Google OAuth API wiki](google.md) here for details on how to register an OAuth app with Google.

## Useful links

-   [GSheet access token specs](https://cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token#response-body)
-   [Google Sheets OAuth scopes](https://developers.google.com/identity/protocols/oauth2/scopes#sheets)

## API specific gotchas

-   While setting up the OAuth app, use the `https://www.googleapis.com/auth/spreadsheets` scope for extended capabilities
