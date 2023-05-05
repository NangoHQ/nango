---
sidebar_label: Braintree
---

# Braintree API wiki

:::note Working with the Braintree API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/braintree.md).

:::

## Using Braintree with Nango

API template name in Nango: `braintree`  
If you want to connect to the Sandbox system use `braintree-sandbox`
Follow our [quickstart](../quickstart.md) to add an OAuth integration with Braintree in 5 minutes.

Supported features in Nango:

| Feature                            | Supported                 |
| ---------------------------------- | ------------------------- |
| [Auth](/nango-auth/core-concepts)  | ✅                        |
| [Proxy](/nango-unified-apis/proxy) | ❎                        |
| Unified APIs                       | _Not included in any yet_ |

**Metadata captured by Nango**  
The `merchandId` is automatically stored in the [Connection Metadata](nango-auth/core-concepts.md#metadata) during the OAuth flow.

## App registration & publishing

**Rating: `Unknown`**
[According to their docs](https://developer.paypal.com/braintree/docs/guides/extend/oauth/overview) OAuth is in private beta testing for production, you need to contact them. You can sign up for an open beta with the Sandbox environment.

## Useful links

-   [Full list of OAuth scopes](https://developer.paypal.com/braintree/docs/guides/extend/oauth/reference#resource-oriented-oauth-scopes)

## API specific gotchas

_No gotchas yet, feel free to contribute it (or check out [airtable](airtable.md) for an example)_
