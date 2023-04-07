---
sidebar_label: Typeform
---

# Typeform API wiki

:::note Working with the Typeform API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/typeform.md).

:::

## Using Typeform with Nango

Provider template name in Nango: `typeform`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Typeform in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://www.typeform.com/developers/get-started/applications/#1-create-an-application-in-the-typeform-admin-panel)


## Useful links

- [How to register an Application](https://www.typeform.com/developers/get-started/applications/#1-create-an-application-in-the-typeform-admin-panel)
- [OAuth-related docs](https://www.typeform.com/developers/get-started/applications/)
- [List of OAuth scopes](https://www.typeform.com/developers/get-started/scopes)
- [Web API docs (their REST API)](https://www.typeform.com/developers/create)

## API specific gotchas

- To receive a refresh token in the first place, you must set the `offline` the sc
- To refresh the token simple use `nango.getToken()` to generate new set of tokens
