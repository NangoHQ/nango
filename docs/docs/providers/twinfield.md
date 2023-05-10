---
sidebar_label: Twinfield
---

# Twinfield API wiki

:::note Working with the Twinfield API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/twinfield.md).

:::

## Using Twinfield with Nango

API template name in Nango: `twinfield`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Twinfield in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

## App registration & publishing

Register your app on the [Dev Portal](https://developers.twinfield.com/home). It is all self-service, and fairly self explanatory, you will need to set a client, link it with your app etc.
After that your app in Twinfield is ready to be used. 

They are however moving towards only allowing certified apps to be used, what this means for clients made in the Dev Portal is not clear. Worst case scenario you will have to apply for their [partner program](https://wktaaeu.my.site.com/nlcommunity/s/article/Wat-komt-er-aan-bod-tijdens-de-certificering?language=en_US).

## Useful links

-   [Developer Portal](https://developers.twinfield.com/home)
-   [Api Reference](https://accounting.twinfield.com/webservices/documentation/#/)
-   [OpenID Connect Authentication](https://accounting.twinfield.com/webservices/documentation/#/ApiReference/Authentication/OpenIdConnect/#/)
-   [Scopes](https://accounting.twinfield.com/webservices/documentation/#/ApiReference/Authentication/OpenIdConnect#Scopes)

## API specific gotchas

-   During the OAuth flow the user can decide to which resources (Bases) the app should have access to. [Read more here](https://airtable.com/developers/web/api/oauth-reference#resources)
-   Refresh tokens also expire after 60 days of non use. Make sure you call `nango.getToken()` at least every 60 days to trigger a refresh.
