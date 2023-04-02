---
sidebar_label: Mailchimp
---

# Mailchimp API wiki

:::note Working with the Mailchimp API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/mailchimp.md).

:::

## Using Mailchimp with Nango

Provider template name in Nango: `mailchimp`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with mailchimp in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2)


## Useful links

- [Web API docs (their REST API)](https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2)
- [How Register an Application](https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/#register-your-application)

## API specific gotchas

- Scopes are not used as a query param in the authorization url hence we ignore the scope 
