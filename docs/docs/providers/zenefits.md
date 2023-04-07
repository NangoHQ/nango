---
sidebar_label: Zenefits
---

# Zenefits API wiki

:::note Working with the Zenefits API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/zenefits.md).

:::

## Using Zenefits with Nango

Provider template name in Nango: `zenefits`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Zenefits in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developers.zenefits.com/reference/getting-started#:~:text=%F0%9F%91%8D-,How%20do%20you%20sign%20up%3F,-We%20hope%20this)


## Useful links

- [How to register an Application](https://developers.zenefits.com/reference/getting-started#:~:text=%F0%9F%91%8D-,How%20do%20you%20sign%20up%3F,-We%20hope%20this)
- [OAuth-related docs](https://developers.zenefits.com/reference/auth)
- [List of OAuth scopes](https://developers.zenefits.com/reference/permissions)
- [Web API docs (their REST API)](https://developers.zenefits.com/reference/overview-1)

## API specific gotchas

- To refresh the token simple use `nango.getToken()` to generate new set of tokens
