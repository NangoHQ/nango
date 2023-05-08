---
sidebar_label: Confluence
---

# Confluence API wiki

:::note Working with the Confluence API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/confluence.md).

:::

## Using confluence with Nango

API template name in Nango: `confluence`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Confluence in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/#enabling-oauth-2-0--3lo-)


## Useful links

- [Registering an App](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/#enabling-oauth-2-0--3lo-)
- [OAuth-related docs](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps)
- [List of OAuth scopes](https://developer.atlassian.com/cloud/jira/platform/scopes-for-oauth-2-3LO-and-forge-apps/#classic-scopes)

## API specific gotchas

- ****To allow the possibility of refreshing the token**. You must add `offline_access`to your scopes when creating the integration on the Nango UI.**
- When you create an OAuth 2.0 (3LO) app, it's private by default. Before using the integration, you must make your app public. If you want to make your app public find the how-to [here](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/#distributing-your-oauth-2-0--3lo--apps)
- Refresh tokens will expire after 365 days of non use and will expire by 90 days if the resource owner is inactive for 90 days, Make sure you call `nango.getToken()` at least every 365 days to trigger a refresh. See reference [here](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/#how-do-i-get-a-new-access-token--if-my-access-token-expires-or-is-revoked-).

