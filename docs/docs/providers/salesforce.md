---
sidebar_label: Salesforce
---

# Salesforce API wiki

:::note Working with the Salesforce API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/salesforce.md).

:::

## Using Salesforce with Nango

API template name in Nango: `salesforce`  
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Salesforce in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

**Metadata captured by Nango**  
The `instance_url` is automatically stored in the [Connection Metadata](nango-auth/core-concepts.md#metadata) when it gets the access token.

## App registration & publishing

Quick & easy for testing:

-   Sign up for a Salesforce developer account.
-   Login and in Setup create a new "Connected App" under `Apps -> App Manager`. Make sure you enable the OAuth section.
-

## Useful links

-   [Salesforce OAuth documentation](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_authorization_code_credentials_flow.htm&type=5) (Step 7 contains the details of what Salesforce returns along with the token)
-   [Overview of OAuth scopes](https://help.salesforce.com/s/articleView?id=sf.connected_app_create_api_integration.htm&type=5)

## API specific gotchas

-   Salesforce calls the `client_id` and `client_secret` the `Consumer Key` and `Consumer Secret`
-   To enable offline data access with a refresh token, add the `refresh_token` (or its synonym, `offline_access`) scope. By default access tokens expire in ~2h (but customers can configure this value).
-   If you encounter an error in your flow that says `invalid_client_id` [make sure your (developer) User's password does not contain any special characters](https://developer.salesforce.com/forums/?id=906F00000009ABLIA2) (yes, really.)
-   Nango automatically stores the `instance_url` (e.g. `https://yourInstance.salesforce.com/`) in the [Connection metadata](nango-auth/core-concepts.md#metadata) for you. You can easily retrieve this with the [backend SDK](nango-auth/node-sdk.md#connectionDetails) or [Connections API](nango-auth/connections-api.md#connectionDetails)
