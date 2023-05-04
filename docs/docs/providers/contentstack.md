---
sidebar_label: Contentstack
---

# Contentstack API wiki

:::note Working with the Contentstack API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/contentstack.md).

:::

## Using Contentstack with Nango

Provider template name in Nango: `contentstack`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Contentstack in 5 minutes.

Make sure you [read this](../nango-auth/frontend-sdk.md#connection-config) to set the correct subdomain and app ID before starting an OAuth flow for Contentstack.

## App registration & publishing

You need to [register as a User](https://www.contentstack.com/login/) with Contentstack to get access to the OAuth API.

## Useful links

-   [List of OAuth scopes](https://www.contentstack.com/docs/developers/developer-hub/oauth-scopes/)
-   [Contentstack Oauth2 Documentation](https://www.contentstack.com/docs/developers/developer-hub/contentstack-oauth)

## API specific gotchas

-   You are required to pass in the correct subdomain and App ID before starting an OAuth flow (cf. [Connection configuration](../nango-auth/frontend-sdk.md#connection-config)).
