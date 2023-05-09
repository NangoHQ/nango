---
sidebar_label: Linkedin
---

# Linkedin API wiki

:::note Working with the Linkedin API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/linkedin.md).

:::

## Using Linkedin with Nango
API template name in Nango: `linkedin`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with LinkedIn in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

**Rating: `Easy & fast`**  
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow?tabs=HTTPS1#step-1-configure-your-application)



## Useful links

- [How to register an Application](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow?tabs=HTTPS1#step-1-configure-your-application)
- [OAuth-related docs](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow?context=linkedin%2Fcontext&tabs=HTTPS1)
- [API](https://learn.microsoft.com/en-us/linkedin/?context=linkedin%2Fcontext)


## API specific gotchas
- If the scope permissions are changed in your app, your users must re-authenticate to ensure that they have explicitly granted your application all of the permissions that it is requesting on their behalf.
- The scopes available to your app depend on which Products or Partner Programs your app has access to.

