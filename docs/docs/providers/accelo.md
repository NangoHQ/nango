---
sidebar_label: Accelo
---

# Accelo API wiki

:::note Working with the Accelo API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/accelo.md).

:::

## Using Accelo with Nango

Provider template name in Nango: `accelo`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Accelo in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://api.accelo.com/docs/#registering-your-application)


## Useful links

- [How to register an Application](https://api.accelo.com/docs/#registering-your-application)
- [OAuth-related docs](https://api.accelo.com/docs/#authentication)
- [List of OAuth scopes](https://api.accelo.com/docs/#scope)

## API specific gotchas
- You  will have to provide your deployment name as a subdomain  `nango.auth('accelo', '1', {params: {subdomain: 'accelo-subdomain'}})`
