---
sidebar_label: Digital Ocean
---

# Digital Ocean API wiki

:::note Working with the Digital Ocean API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/digitalocean.md).

:::

## Using Digital Ocean with Nango

API template name in Nango: `digitalocean`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Digital Ocean in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

**Rating: `Easy & fast`**  
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://cloud.digitalocean.com/login?redirect_url=https%3A%2F%2Fcloud.digitalocean.com%2Faccount%2Fapi%2Fapplications%2Fnew)

## Useful links

-   [How to register an Application](https://cloud.digitalocean.com/login?redirect_url=https%3A%2F%2Fcloud.digitalocean.com%2Faccount%2Fapi%2Fapplications%2Fnew)
-   [OAuth-related docs](https://cloud.digitalocean.com/login?redirect_url=https%3A%2F%2Fcloud.digitalocean.com%2Faccount%2Fapi%2Fapplications%2Fnew)
-   [List of OAuth scopes](https://docs.digitalocean.com/reference/api/oauth-api/#scopes)
-   [Web API docs (their REST API)](https://docs.digitalocean.com/reference/api/intro/)

## API specific gotchas

-   To refresh the token simple use `nango.getToken()` to generate new set of tokens
