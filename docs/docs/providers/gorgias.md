---
sidebar_label: Gorgias
---

# Gorgias API wiki

:::note Working with the Gorgias API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/gorgias.md).

:::

## Using Gorgias with Nango

Provider template name in Nango: `gorgias`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Gorgias in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developers.gorgias.com/docs/1-register-on-developer-portal)


## Useful links

- [How to register an Application](https://developers.gorgias.com/docs/1-register-on-developer-portal)
- [OAuth-related docs](https://developers.gorgias.com/docs/oauth2-authentication-for-creating-apps-with-gorgias)
- [List of OAuth scopes](https://developers.gorgias.com/docs/oauth2-scopes)
- [Web API docs (their REST API)](https://developers.gorgias.com/reference/introduction)

## API specific gotchas
- To refresh tokens, you will need to set the `offline` as part of the scopes when creating an integration. 
- To refresh the token simple use `nango.getToken()` to generate new set of tokens.
