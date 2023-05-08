---
sidebar_label: Deel
---

# Deel API wiki

:::note Working with the Deel API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/deel.md).

:::

## Using Deel with Nango

API template name in Nango: `deel`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Deel in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

**Rating: `Easy & fast`**  
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developer.deel.com/docs/oauth2-apps#create-an-appn)

## Useful links

-   [How to register an Application](https://developer.deel.com/docs/oauth2-apps#create-an-app)
-   [OAuth-related docs](https://developer.deel.com/docs/oauth2)
-   [List of OAuth scopes](https://developer.deel.com/docs/scopes-1)

## API specific gotchas

-   Deel provides a separate environment for testing/sandbox and production. We have also provided two different providers for this purpose. Hence, to create an integration for the sandbox, use `deel-sandbox` and for production use `deel`.
