---
sidebar_label: Zoho Desk
---

# Zoho desk API wiki

:::note Working with the Zoho Desk API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/zoho-desk.md).

:::

## Using Zoho Desk with Nango

Provider template name in Nango: `zoho-desk`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Zoho Desk in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://desk.zoho.com/DeskAPIDocument#OauthTokens#RegisteringAClient)


## Useful links

- [How to register an Application](https://desk.zoho.com/DeskAPIDocument#OauthTokens#RegisteringAClient)
- [OAuth-related docs](https://desk.zoho.com/DeskAPIDocument#OauthTokens)
- [List of OAuth scopes](https://desk.zoho.com/DeskAPIDocument#OauthTokens#OAuthScopes)
- [Web API docs (their REST API)](https://desk.zoho.com/DeskAPIDocument#Introduction)

## API specific gotchas

- Depending on the region your account was created in, you must apply the extension params when initiating the auth flow. For example here. You should use _eu_ for an account in the eu region. `nango.auth('amazon', '1', {params: {extension: 'eu'}})`
