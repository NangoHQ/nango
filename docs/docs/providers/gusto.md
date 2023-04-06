---
sidebar_label: Gusto
---

# Gusto API wiki

:::note Working with the Gusto API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/gusto.md).

:::

## Using Gusto with Nango

Provider template name in Nango: `gusto`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Gusto in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://embedded.gusto.com)


## Useful links

- [Developer Account](https://embedded.gusto.com)
- [OAuth-related docs](https://docs.gusto.com/embedded-payroll/docs/oauth2)
- [List of OAuth scopes](https://docs.gusto.com/embedded-payroll/docs/scopes)

## API specific gotchas

- To refresh the token simple use `nango.getToken()` to generate new set of tokens
