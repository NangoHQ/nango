---
sidebar_label: Payfit
---

# Payfit API wiki

:::note Working with the Payfit API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/payfit.md).

:::

## Using Payfit with Nango

Provider template name in Nango: `payfit`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Payfit in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developers.payfit.io/docs/quickstart-guide#2%EF%B8%8F%E2%83%A3-become-a-payfit-partner)


## Useful links

- [How to register an Application](https://developers.payfit.io/docs/quickstart-guide#2%EF%B8%8F%E2%83%A3-become-a-payfit-partner)
- [OAuth-related docs](https://developers.payfit.io/docs/implementing-the-oauth2-flow)
- [List of OAuth scopes](https://developers.payfit.io/docs/scopes-2)

## API specific gotchas

- Payfit does not return a refresh token, you will have to reauthorize the user again. 
