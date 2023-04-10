---
sidebar_label: Health Gorilla
---

# Health Gorilla API wiki

:::note Working with the Health Gorilla API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/healthgorilla.md).

:::

## Using Health Gorilla with Nango

Provider template name in Nango: `healthgorilla`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Health Gorilla in 5 minutes.

## App registration & publishing

**Rating: `Easy & fast`**
Registering an app takes only a few minutes, and you can start building immediately: [App registration docs](https://developer.healthgorilla.com/docs/oauth20#1-obtaining-oauth-20-credentials)


## Useful links

- [How to register an Application](https://developer.healthgorilla.com/docs/oauth20#1-obtaining-oauth-20-credentials)
- [OAuth-related docs](https://developer.healthgorilla.com/docs/oauth20)
- [List of OAuth scopes](https://developer.healthgorilla.com/docs/oauth20#:~:text=and%20special%20symbols%3E-,Scopes,-Available%20scopes%20is)
- [Web API docs (their REST API)](https://developer.healthgorilla.com/docs/provider-authorization-api#:~:text=User%20Provisioning-,API,-Identity%20Verification%20API)

## API specific gotchas

- To refresh the token simple use `nango.getToken()` to generate new set of tokens
