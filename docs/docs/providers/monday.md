---
sidebar_label: Monday
---

# Monday API wiki

:::note Working with the Monday API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/monday.md).

:::

## Using Monday with Nango

Provider template name in Nango: `monday`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Monday in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developer.monday.com/apps/docs/oauth#registering-a-monday-app)



## Useful links

- [How to register an Application](https://developer.monday.com/apps/docs/oauth#registering-a-monday-app)
- [OAuth-related docs](https://developer.monday.com/apps/docs/oauth)
- [List of OAuth scopes](https://developer.monday.com/apps/docs/oauth#set-up-permission-scopes)
- [API](https://developer.monday.com/apps/docs/quickstart-integration)


## API specific gotchas
- Access tokens do not expire and will be valid until the user uninstalls your app. Our OAuth flow does not support refresh tokens at the moment.
