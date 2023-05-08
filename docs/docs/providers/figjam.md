---
sidebar_label: Figjam
---

# Figjam API wiki

:::note Working with the Figjam API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/figjam.md).

:::

## Using Figjam with Nango

API template name in Nango: `figjam`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Figjam in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://www.figma.com/developers/api#authentication:~:text=comments%20to%20files.-,Getting%20started,-If%20you%E2%80%99re%20not)

## Useful links

-   [Registering an App](https://www.figma.com/developers/api#authentication:~:text=OAuth%202%20Token.-,Register%20an%20Application,-Registering%20an%20app)
-   [OAuth-related docs](https://www.figma.com/developers/api#authentication)
-   [List of OAuth scopes](https://www.figma.com/developers/api#authentication:~:text=to%20your%20app.-,scope,-Currently%20this%20value)

## API specific gotchas

-   The only scope allowed can only be _`file_read`_
