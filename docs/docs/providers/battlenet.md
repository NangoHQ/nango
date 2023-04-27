---
sidebar_label: Battlenet
---

# Battlenet API wiki

:::note Working with the Battlenet API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/battlenet.md).

:::

## Using Battlenet with Nango

Provider template name in Nango: `battlenet`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Battlenet in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://develop.battle.net/documentation/guides/getting-started)


## Useful links

- [How to register an Application](https://develop.battle.net/documentation/guides/getting-started)
- [OAuth-related docs](https://develop.battle.net/documentation/guides/using-oauth)
- [List of OAuth scopes](https://develop.battle.net/documentation/guides/using-oauth#:~:text=Scopes%20and%20OAuth%20enabled%20APIs)

## API specific gotchas

- Depending on the region you want to connect to, you have to provide the region as an extension in the config params.
   You should use `nango.auth('amazon', '1', {params: {extension: 'com.cn'}})`. The provided extension here shows that the region is china.
- Tokens cannot be refreshed, hence when the token expires, resource owners will have to go through the authorize flow again.
