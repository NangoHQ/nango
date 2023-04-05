---
sidebar_label: Miro
---

# Miro API wiki

:::note Working with the Miro API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/miro.md).

:::

## Using Miro with Nango

Provider template name in Nango: `miro`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Miro in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developers.miro.com/docs/rest-api-build-your-first-hello-world-app#step-1-create-your-app-in-miro)


## Useful links

- [Registering an App](https://developers.miro.com/docs/rest-api-build-your-first-hello-world-app#step-1-create-your-app-in-miro)
- [OAuth-related docs](https://developers.miro.com/docs/getting-started-with-oauth)
- [List of OAuth scopes](https://developers.miro.com/reference/scopes)
- [API reference](https://developers.miro.com/reference/api-reference)

## API specific gotchas
- An access token expires in 1 hour and a refresh token expires in 60 days. 
- You can use the `nango.getToken('<CONFIG-KEY>', '<CONNECTION-ID>')` to refresh the token, and the token will be refreshed if it is expired.

