---
sidebar_label: Qualtrics
---

# Qualtrics API wiki

:::note Working with the Qualtrics API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/qualtrics.md).

:::

## Using Qualtrics with Nango

Provider template name in Nango: `qualtrics`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Qualtrics in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
You cannot sign up for a free plan on the main Qualtrics page, but you can on this [page](https://www.qualtrics.com/support/survey-platform/managing-your-account/trial-accounts/). Then you can register an app on the [Developer Portal](https://developer.qualtrics.com/developer/portal/).

## Useful links

-   [Registering an App](https://developer.qualtrics.com/developer/portal/)
-   [OAuth-related docs](https://api.qualtrics.com/6c02f17c3109f-o-auth-authentication-auth-code)
-   [List of OAuth scopes](https://api.qualtrics.com/1450e85735dbf-o-auth-2-0-scopes)
-   [API reference](https://developer.qualtrics.com/developer/portal/documentation/1bd4e078a35c1-hello-world-setup)

## API specific gotchas

-   You are required to pass in the Data Center used to register your Qualtrics account as a subdomain for both the OAuth requests and subsequent API requests (cf. [Connection configuration](../reference/frontend-sdk.md#connection-config)).
-   If you trigger the OAuth flow for a user that has already been authorized, Qualtrics will return an error.
