---
sidebar_label: Brex
---

# Brex API wiki

:::note Working with the Brex API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/brex.md).

:::

## Using Brex with Nango

API template name in Nango: `brex`  
For testing with Brex's staging system use `brex-staging` instead.  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Brex in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

You need to [register as Partner](https://www.brex.com/partners) with Brex to get access to the OAuth API. We also recommend you join their developers Slack community (see link below), where support is fastest.

## Useful links

-   [Brex API docs](https://developer.brex.com/)
-   [Brex Developers Slack Community (official)](https://join.slack.com/t/brexdev/shared_invite/zt-vgwh6rja-CjydrUA4uJSB90ZO~gnI8Q)
-   [List of OAuth scopes](https://developer.brex.com/docs/roles_permissions_scopes/#scopes)

## API specific gotchas

-   Include the scope `offline_access` to get a refresh token (access tokens expire after 1h)
-   Refresh tokens expire after 90 days of non use. Make sure you regularly make an API request as long as you need the connection.
-   Brex offers a staging system to test your apps, you will get access when you register as a partner. Staging details are [here](https://developer.brex.com/docs/partner_authentication/#api-servers)
