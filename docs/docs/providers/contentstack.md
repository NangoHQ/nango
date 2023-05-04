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

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://www.contentstack.com/docs/developers/developer-hub/contentstack-oauth/#configuring-contentstack-oauth)



## Useful links

- [How to register an Application](https://www.contentstack.com/docs/developers/developer-hub/contentstack-oauth/#configuring-contentstack-oauth)
- [OAuth-related docs](https://www.contentstack.com/docs/developers/developer-hub/contentstack-oauth)
- [List of OAuth scopes](https://www.contentstack.com/docs/developers/developer-hub/oauth-scopes/)


## API specific gotchas
- Depending on the [region](https://www.contentstack.com/docs/developers/developer-hub/contentstack-oauth/#construct-your-authorization-url) you will want to connect to, you will have to provide the region as a extension in the config params. You should use `nango.auth('amazon', '1', {params: {subdomain: 'co.uk'}})`
- Access tokens and app tokens are valid for 60 minutes only, 
- To refresh the token simple use `nango.getToken()` to generate new set of tokens
