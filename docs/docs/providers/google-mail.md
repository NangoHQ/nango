---
sidebar_label: Gmail
---

# Gmail API wiki

:::note Working with the Gmail API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/google-mail.md).

:::

## Using Gmail with Nango

Gmail uses the same OAuth mechanism as other Google services. Please use the Google template for it in Nango: `google`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with the Gmail API in 5 minutes.

## App registration & publishing

Google's APIs all use the same OAuth service. To which APIs you get access is determined by the scopes that you request.

Please check the main [Google OAuth API wiki](google.md) here for details on how to register an OAuth app with Google.

## Useful links

-   [Gmail access token specs](https://cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token#response-body)
-   [Gmail OAuth scopes](https://developers.google.com/identity/protocols/oauth2/scopes#gmail)

## API specific gotchas

-   While setting up the OAuth app, use the `https://mail.google.com/` scope for extended capabilities
