<div align="center">
  
<img src="/assets/nango-logo.png?raw=true" width="350">

</div>

<h1 align="center">A single API for all your integrations</h1>

<div align="center">
Ship integrations fast. Maintain full control.
</div>

<p align="center">
    <br />
    <a href="https://docs.nango.dev/" rel="dofollow"><strong>Explore the docs »</strong></a>
    <br />

  <br/>
    <a href="https://nango.dev/integrations">Supported APIs</a>
    ·
    <a href="https://docs.nango.dev/">Docs</a>
    ·
    <a href="https://nango.dev">Website</a>
    ·
    <a href="https://docs.nango.dev/contribute">Contribute an API</a>
    ·
    <a href="https://github.com/nangohq/nango/issues">Report Bug</a>
    ·
    <a href="https://nango.dev/slack">Slack Community</a>
</p>

Nango simplifies integrating your product with any external API. It's as flexible as building integrations yourself and as quick as choosing a pre-existing solution. This means you can:

* Build the integrations your customers need
* Clean up your codebase
* And get a good night's sleep!

## 👀 An Overview of Nango

With Nango, you can construct integrations in hours, not weeks, while retaining complete control over the integration's logic and access to all external APIs.

Nango merges production-ready infrastructure with [pre-build integration templates](https://docs.nango.dev/integration-templates/overview) for [over 100 APIs](https://docs.nango.dev/integrations/overview):

*   🔐 Authenticate 100+ APIs with just one line of code
*   🔁 Enable bi-directional data synchronization
*   ⏩️ Easily access unified APIs for any category
*   🚫 Automate API-specific rate limits, retries & pagination
*   🧠 Apply strong typing with your custom data models
*   🪝 Utilize webhooks & real-time data syncs
*   👀 Take advantage of built-in monitoring
*   📺 Access your admin dashboard

You'll have full control over the integrations without the headache of maintenance and ops.

## 👩‍💻 Sample Code with Nango

*   A single line to initiate a new OAuth flow & connect an integration:

```js
nango.auth('github', '<user-id>');
```

*   A single line to fetch structured objects from any external API:

```ts
nango.listRecords<GithubIssue>({
    providerConfigKey: 'github',
    connectionId: '<user-id>',
    model: 'GithubIssue', // Or any other data you want to sync
});
```

## ✅ Over 100 Pre-configured APIs, Easy to Add Your Own

Nango works with any API and use-case. [Adding an API](https://docs.nango.dev/contribute) is simple, and we already have many APIs covered.

[Over 100 APIs are pre-configured](https://nango.dev/integrations) to work right out of the box, including:

*   **CRM**: Front, Hubspot, Salesforce, and more
*   **Accounting**: Xero, Sellsy, Zoho Books, and more
*   **Fintech:** Brex, Stripe, Braintree, Ramp, and more
*   **Developer tools**: GitHub, GitLab, Linear, Jira, and more
*   **Communication**: Gmail, Microsoft Teams, Slack, Discord, Zoom, and more
*   **Productivity**: Asana, Airtable, Google Drive, Google Calendar, Trello,
    GSheet, ClickUp, and more
*   **Social**: Twitter, LinkedIn, Reddit, Facebook, and more
*   [and many others...](https://nango.dev/integrations)

If your favorite API is not listed, you can [open a GitHub issue](https://github.com/NangoHQ/nango/issues/new) or [contribute it](https://docs.nango.dev/contribute).

## 🚀 Get started with Nango 

You can try Nango in 10 minutes with the [Quickstart 🚀](https://nango.dev/quickstart).

Or sign up for free:

<a href="https://app.nango.dev/signup" target="_blank">
  <img src="https://raw.githubusercontent.com/NangoHQ/nango/6f49ab92c0ffc18c1d0f44d9bd96c62ac97aaa8d/docs/static/img/nango-deploy-button.svg" alt="Try Nango Cloud" width="215"/>
</a>

## 🕐 When is Nango the Right Choice?

Consider Nango if:

*   You need to build integrations quickly
*   Pre-packaged solutions such as embedded iPaaS or unified APIs are too restrictive
*   You want to minimize maintenance overhead in production

Nango is primarily for SaaS products where integrations are at the heart of the user experience. If your product deeply integrates with other SaaS products, Nango is likely your best bet.

However, Nango is not designed for automating internal workflows or adding single sign-on login options.

## 🙋‍♀️ Why is Nango Open-Source?

At Nango, we believe all software should integrate seamlessly with the other software its users utilize. Integrations are core features in software products and as such should be built by engineers.

Our mission is to simplify the process for engineers to incorporate these integrations into their products with an open platform.

With our open-source approach, every engineer can contribute improvements to the platform for everyone:

*   [Contribute new APIs](https://docs.nango.dev/contribute) for OAuth flows & data syncs
*   [Contribute new integration templates](https://docs.nango.dev/integration-templates/overview) or extend existing one for themselves
*   Share [API specific quirks](https://docs.nango.dev/integrations/all/salesforce#api-gotchas) with other developers

## 🔍 Where to learn more

*   Explore the [documentation](https://docs.nango.dev)
*   Share feedback or ask questions on the [Slack community](https://nango.dev/slack)
*   [Contribute a new API](https://docs.nango.dev/contribute)
*   Check out our [blog on native integrations](https://www.nango.dev/blog)
*   Explore the [integration templates](https://docs.nango.dev/integration-templates/overview)
*   Check out the [100+ supported APIs](https://nango.dev/integrations)

## 💪 Contributors

Thank you for continuously making Nango better ❤️

<a href="https://github.com/nangohq/nango/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nangohq/nango" />
</a>

## 🐻 History

Pizzly (a simple service for OAuth) was initially developed by the team at [Bearer](https://www.bearer.com/?ref=pizzly) with contributions of more than 40 individuals. Over time the focus of Bearer shifted and they could no longer maintain Pizzly. In late 2022 the team at [Nango](https://www.nango.dev) adopted the project and has since maintained and evolved it together with the growing Nango community.
