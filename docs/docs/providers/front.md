---
sidebar_label: Front
---

# Front API wiki

:::note Working with the Front API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/front.md).

:::

## Using Front with Nango

Provider template name in Nango: `front`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Front in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://dev.frontapp.com/docs/create-and-manage-apps#obtain-oauth-credentials-for-your-app)



## Useful links

- [How to register an Application](https://dev.frontapp.com/docs/create-and-manage-apps#obtain-oauth-credentials-for-your-app)
- [OAuth-related docs](https://dev.frontapp.com/docs/oauth)
- [API](https://dev.frontapp.com/reference/introduction)


## API specific gotchas
- Scopes are not required
- Access tokens will expire after One hour, you can use the `nango.getToken('<CONFIG-KEY>', '<CONNECTION-ID>')` to refresh the token, and the token will be refreshed if it is expired.

