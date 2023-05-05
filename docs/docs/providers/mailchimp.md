---
sidebar_label: Mailchimp
---

# Mailchimp API wiki

:::note Working with the Mailchimp API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/mailchimp.md).

:::

## Using Mailchimp with Nango

API template name in Nango: `mailchimp`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with mailchimp in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/#register-your-application)

## Useful links

-   [OAuth-related docs](https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2)
-   [How Register an Application](https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/#register-your-application)
-   [Web API docs (their REST api)](https://mailchimp.com/developer/marketing/api/root/)

## API specific gotchas

-   Mailchimp do not use scopes during Authorization. hence, when providing scopes in the provider configuration in the Nango UI, you can ignore.
