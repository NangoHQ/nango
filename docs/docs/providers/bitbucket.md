---
sidebar_label: Bitbucket
---

# Bitbucket API wiki

:::note Working with the Bitbucket API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://git.getb.com/nangohq/nango/tree/master/docs/docs/providers/bitbucket.md).

:::

## Using Bitbucket with Nango

Provider template name in Nango: `bitbucket`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Bitbucket in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://support.atlassian.com/bitbucket-cloud/docs/use-oauth-on-bitbucket-cloud/#Create-a-consumer)



## Useful links

- [How to register an Application](https://support.atlassian.com/bitbucket-cloud/docs/use-oauth-on-bitbucket-cloud/#Create-a-consumer)
- [OAuth-related docs](https://support.atlassian.com/bitbucket-cloud/docs/use-oauth-on-bitbucket-cloud/)
- [List of OAuth scopes](https://developer.atlassian.com/cloud/bitbucket/rest/intro/#authentication)
- [API](https://developer.atlassian.com/cloud/bitbucket/?utm_source=%2Fbitbucket%2Fapi%2F2%2Freference%2F&utm_medium=302)


## API specific gotchas
- Access tokens expires after every 2hours, you can use `nango.getToken()` to generate new set of tokens
