---
sidebar_label: Airtable
---
# Airtable API wiki

:::note Working with the Airtable API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/main/docs/docs/providers/airtable.md).  

:::

## Using Airtable with Nango
Provider template name in Nango: `airtable`  
Follow our [getting started guide](../reference/guide.md) to add an OAuth integration with Airtable in 5 minutes.

## App registration & publishing
**Rating: `Easy & fast`**  
Registering an app takes only a few minutes and you can start building immediately: [App registration docs](https://airtable.com/developers/web/guides/oauth-integrations)  
To publish it (so any airtable user can install it) a few more details are needed (support email, terms) but no manual review: [Publishing docs](https://airtable.com/developers/web/guides/oauth-integrations#distributing-your-integration)


## Useful links
* [Web API docs (their REST API)](https://airtable.com/developers/web/api/introduction)
* [List of OAuth scopes](https://airtable.com/developers/web/api/scopes)
* [Information on rate limits](https://airtable.com/developers/web/api/rate-limits)

## API specific gotchas
* During the OAuth flow the user can decide to which resources (Bases) the app should have access to. [Read more here](https://airtable.com/developers/web/api/oauth-reference#resources)
* Refresh tokens also expire after 60 days of non use. Make sure you call `nango.getToken()` at least every 60 days to trigger a refresh.
