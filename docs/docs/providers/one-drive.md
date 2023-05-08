---
sidebar_label: OneDrive
---

# OneDrive API wiki

:::note Working with the OneDrive API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/one-drive.md).

:::

## Using OneDrive with Nango

API template name in Nango: `oneDrive`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with One drive in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/getting-started/graph-oauth?view=odsp-graph-online#register-your-app)

## Useful links

-   [How to register an Application](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/getting-started/graph-oauth?view=odsp-graph-online#register-your-app)
-   [OAuth-related docs](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/getting-started/authentication?view=odsp-graph-online)
-   [List of OAuth scopes](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/getting-started/graph-oauth?view=odsp-graph-online#authentication-scopes)
-   [Web API docs (their REST API)](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/?view=odsp-graph-online)

## API specific gotchas

-   To get refresh token, you will need to add **`offline_access`** to the list of your scopes.
-   To refresh the token simple use `nango.getToken()` to generate new set of tokens
