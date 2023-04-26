---
sidebar_label: Outreach
---

# Outreach API wiki

:::note Working with the Outreach API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/outreach.md).

:::

## Using Outreach with Nango

Provider template name in Nango: `outreach`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Outreach in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**  
You need to have an Outreach account and currently there are no dev accounts. Once you have that, registering an app takes only a few minutes and you can start building immediately: [App registration docs](https://support.outreach.io/hc/en-us/articles/9986965571867-How-to-Access-Outreach-APIs)

## Useful links

-   [How to register an Application](https://support.outreach.io/hc/en-us/articles/9986965571867-How-to-Access-Outreach-APIs)
-   [OAuth-related docs](https://api.outreach.io/api/v2/docs#authentication)
-   [Web API docs (their REST API)](https://api.outreach.io/api/v2/docs#making-requests)

## API specific gotchas

-   To refresh the token simple use `nango.getToken()` to generate new set of tokens
