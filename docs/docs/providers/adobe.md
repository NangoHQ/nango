---
sidebar_label: Adobe
---

# Adobe API wiki

The Adobe provider can be used for all Adobe services [API](https://developer.adobe.com/apis/).

:::note Working with the Adobe API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/adobe.md).

:::

## Using Adobe with Nango

Provider template name in Nango: `adobe`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Adobe in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developer.adobe.com/developer-console/docs/guides/getting-started/)


## Useful links

- [How to register an Application](https://developer.adobe.com/developer-console/docs/guides/getting-started)
- [OAuth-related docs](https://developer.adobe.com/developer-console/docs/guides/authentication/OAuth)
- [Adding an Adobe service](https://developer.adobe.com/developer-console/docs/guides/services/services-add-api-oauth/)
- [List of OAuth scopes](https://developer.adobe.com/developer-console/docs/guides/authentication/OAuth/Scopes/)

## API specific gotchas
- If the service you are trying to integrate allows `offline_access` then you will be able to get refresh token if you add this in the scopes
- Depending on the selected API, some platforms may not be available to be used with that API. Select the platform that best suits your application use case if more than one platform is available.
- When creating an API make, it is important to web app as the type of application you are integrating too.(Not all apps support OAuth 2.0 )
- To refresh the token simple use `nango.getToken()` to generate new set of tokens
