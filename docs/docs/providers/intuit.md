---
sidebar_label: Intuit
---

# Intuit API wiki

:::note Working with the Intuit API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/intuit.md).

:::

## Using Intuit with Nango

Provider template name in Nango: `intuit`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Intuit in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0#create-an-app)



## Useful links

- [How to register an Application](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0#create-an-app)
- [OAuth-related docs](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
- [List of OAuth scopes](https://developer.intuit.com/app/developer/qbo/docs/learn/scopes)


## API specific gotchas
- Refresh tokens have a rolling expiry of 100 days, If 100 days pass, or your refresh token expires, users need to go through the authorization flow again and reauthorize your app.
