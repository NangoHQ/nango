# Advanced Configurations

## Custom Callback URL

The Callback URL is the URL used by the OAuth Provider to communicate with your OAuth server, in this case the Nango server. You specify which Callback URL to use when you create an OAuth app on the Provider's developer portal.

Nango Cloud uses the following Callback URL: `https://api.nango.dev/oauth/callback`.

:::info
When specifying this callback URL to the Provider, please copy/paste it exactly. Any difference (e.g. a trailing `/`) could cause the Provider to reject the OAuth requests.
:::

Nango Cloud lets you customize the Callback URL, to use your own domain instead of `https://api.nango.dev`, on your [Dashboard](https://app.nango.dev/). When using a custom Callback URL, you should redirect any request made to your Callback URL to `https://api.nango.dev/oauth/callback`, passing all parameters along. The simplest way to do this is to use a 308 redirect.

:::info
Before changing the Callback URL in Nango, you should make sure that your redirect works and that your OAuth app is configured to use the new Callback URL, otherwise the OAuth requests will be rejected by the Provider.
:::

Nango Self-Hosted also supports custom callback URLs (cf. [docs](../nango-deploy/oss-instructions.md#custom-urls)).

## Something not working as expected? Need help?

If you run into any trouble with Nango or have any questions please do not hesitate to contact us - we are happy to help!

Please join our [Slack community](https://nango.dev/slack), where we are very active, and we will do our best to help you fast.
