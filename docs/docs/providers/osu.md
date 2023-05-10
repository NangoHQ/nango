---
sidebar_label: osu!
---

# osu! API wiki

:::note Working with the osu! API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/master/docs/docs/providers/osu.md).

:::

## Using osu! with Nango

The provider is listed under `osu` in Nango. For more information, read the [quickstart guide](../quickstart.md).

## App registration

**Rating: `Easy & fast`**

Registering an application does not require any approval, and can be done in just a few minutes.

1. Go to your [account settings page](https://osu.ppy.sh/home/account/edit).
2. At the very bottom, there should be an `OAuth` section containing a list of `own clients`. Click the button labeled `New OAuth Application` and fill out the form as instructed.
3. To get your client ID & secret, click the `Edit` button in the `own clients` list.

## Useful links

-   [API documentation](https://docs.ppy.sh)

## API specific gotchas

-   Tokens expire in 1 day from when they are requested.
