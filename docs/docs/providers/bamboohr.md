---
sidebar_label: BambooHr
---

# BambooHr API wiki

:::note Working with the BambooHr API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/bamboohr.md).

:::

## Using BambooHr with Nango
Provider template name in Nango: `bamboohr`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with BambooHr in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                                 |
| ---------------------------------- | ----------------------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                                        |
| Unified APIs                       | [HRIS](/nango-unified-apis/hris/overview) |

## App registration & publishing
**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://documentation.bamboohr.com/docs/getting-started#what-will-you-need-to-get-started)


## Useful links

- [Web API docs (their REST API)](https://documentation.bamboohr.com/docs/getting-started)
- [How to register/integrate an Application](https://documentation.bamboohr.com/docs#what-will-you-need-to-get-started)
- [OAuth-related docs](https://documentation.bamboohr.com/page/single-sign-on-sso-with-openid-connect)



## API specific gotchas
- When creating a connection you need to add the subdomain as a params argument, for example `nango.auth('bamhoo-hr', '1', {params: {subdomain: '<your-subdomain>'}})`
