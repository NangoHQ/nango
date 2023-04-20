---
sidebar_label: BambooHR
---

# BambooHR API wiki

:::note Working with the BambooHR API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/bamboohr.md).

:::

## Using BambooHR with Nango

Provider template name in Nango: `bamboohr`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with BambooHR in 5 minutes.

## Creating integration and connection

For creating an integration with BambooHR instance, one would need the following details:

1.  client_id
2.  client_secret
3.  scopes (use the default value: `openid,email`)

Please check the page https://documentation.bamboohr.com/docs/getting-started#what-will-you-need-to-get-started for details on how to get the `client_id` and `client_secret`

BambooHR uses account specific authorization url and token url, hence Nango uses parametrized urls in the provider config for BambooHR. You need to pass the `subdomain` of your account as a parameter to the Connection config.

For e.g: if the subdomain for your account is `foo`, then you need to pass the following connection config:

```json
{
    "subdomain": "foo"
}
```

## Useful links

-   [Web API docs (their REST API)](https://documentation.bamboohr.com/docs/getting-started)

-   [How to register/integrate an Application](https://documentation.bamboohr.com/docs#what-will-you-need-to-get-started)

-   [OAuth-related docs](https://documentation.bamboohr.com/page/single-sign-on-sso-with-openid-connect)
