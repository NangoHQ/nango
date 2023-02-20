---
sidebar_label: Brex
---

# Brex API wiki

:::note Working with the Brex API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/brex.md).

:::

## Using Brex with Nango

Provider template name in Nango: `brex`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Brex in 5 minutes.

## App registration & publishing

You need to [register as Partner](https://www.brex.com/partners) with Brex to get access to the OAuth API.

## Useful links

-   [List of OAuth scopes](https://developer.brex.com/docs/roles_permissions_scopes/#scopes)

## API specific gotchas

-   Include the scope `offline_access` to get a refresh token (access tokens expire after 1h)
-   Refresh tokens expire after 90 days of non use. Make sure you regularly make an API request as long as you need the connection.
