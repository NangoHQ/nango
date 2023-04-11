---
sidebar_label: Amazon
---

# Amazon API wiki

:::note Working with the Amazon API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/amazon.md).

:::

## Using Amazon with Nango

Provider template name in Nango: `amazon`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Amazon in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developer.amazon.com/docs/login-with-amazon/register-web.html)


## Useful links

- [How to register an Application](https://developer.amazon.com/docs/login-with-amazon/register-web.html)
- [OAuth-related docs](https://developer.amazon.com/docs/login-with-amazon/authorization-code-grant.html)
- [List of OAuth scopes](https://developer.amazon.com/docs/login-with-amazon/customer-profile.html)

## API specific gotchas
- Depending on the region you will want to connect to, you will have to provide the region as am extension in the config params. 
You should use `nango.auth('amazon', '1', {params: {extension: 'co.uk'}})`
- To refresh the token simple use `nango.getToken()` to generate new set of tokens
