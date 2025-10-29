<div align="center">

<img src="/assets/nango-logo.png?raw=true" width="350">

</div>

<h1 align="center">Infrastructure for product integrations.</h1>

<div align="center">
Easily integrate your SaaS product & AI agent with 500+ APIs.
</div>

<p align="center">
    <br />
    <a href="https://nango.dev/docs/" rel="dofollow"><strong>Explore the docs »</strong></a>
    <br />

  <br/>
    <a href="https://nango.dev/integrations">500+ supported APIs</a>
    ·
    <a href="https://nango.dev">Website</a>
    ·
    <a href="https://nango.dev/slack">Slack Community</a>
</p>

## Core features

Nango is a complete infrastructure for engineers to build **product integrations**.[<sup>1</sup>](#what-are-product-integrations)

- **[API Auth](https://nango.dev/docs/guides/use-cases/api-auth)** for [500+ APIs](https://www.nango.dev/api-integrations)
    - **Embedded, white-label auth UI**: With appropriate input forms and guidance.
    - **Secure credential management**: Retrieval, storage, and refreshing of API credentials.
    - **Credential monitoring**: Notifies via webhooks when credentials become invalid.
- **[Request proxying](https://nango.dev/docs/guides/use-cases/proxy)**: Injects credentials into API requests seamlessly.
- **[Data Syncing](https://nango.dev/docs/guides/use-cases/syncs)**: Continuously synchronize data from APIs to your application.
- **[Actions](https://nango.dev/docs/guides/use-cases/actions)**: Encapsulate use cases into reusable actions.
- **[Webhooks](https://nango.dev/docs/guides/use-cases/webhooks)**: Listen to webhooks from APIs with a universal interface.
- **[MCP Server](https://nango.dev/docs/guides/use-cases/ai-tool-calling)**: Expose your integrations as an MCP server for tool calling.
- **[Observability](https://nango.dev/docs/guides/platform/logs)**: Tailored monitoring for integrations.
- **Management dashboard & APIs**: Control and oversee all connected accounts.

## Benefits

- **Speed**: Eliminates the need to build authorization flows and infrastructure for each API.
- **Reliability**: Provides a robust solution from day one.
- **Security**: Ensures secure storage and retrieval of API credentials & user data.
- **Observability**: Provides full visibility into every interaction with the external API.
- **Modularity**: Pick the features you want to use, without vendor lock-in.

By leveraging Nango, developers can save days per integration and months over time.

## Our approach to integrations

We believe engineering teams should build their own integrations.

Our goal with Nango is to provide a better way to do this:
- Nango provides the infrastructure to build reliable, scalable integrations fast: API auth, syncing framework, webhook handling, observability, etc.
- You focus on what makes your integration great for your customers: Seamless product mappings, excellent UX, and deep integration with your existing product.

[Read more about our approach](https://nango.dev/docs/getting-started/intro-to-nango#our-approach-to-integrations).

## Getting started

Access any API in minutes, and fully embed the flow within your app in an hour.

Follow the [quickstart](https://nango.dev/docs/getting-started/quickstart) and [explore the docs](https://nango.dev/docs).

## Open-source vs. paid

Nango is offered under the [Elastic license](https://github.com/NangoHQ/nango/blob/master/LICENSE).

You can [self-host it for free](https://nango.dev/docs/guides/self-hosting/free-self-hosting/overview) with a limited feature set.

Our cloud and Enterprise self-hosted version let you access all features, according to your [plan](https://www.nango.dev/pricing).

## Contributors

Anybody can [contribute support for a new API](https://nango.dev/docs/implementation-guides/platform/contribute-new-api).

Thank you for continuously making Nango better ❤️

<a href="https://github.com/nangohq/nango/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nangohq/nango" />
</a>

## History

Pizzly (a simple service for OAuth) was initially developed by the team at [Bearer](https://www.bearer.com/?ref=pizzly) with contributions of more than 40 individuals. Over time the focus of Bearer shifted and they could no longer maintain Pizzly. In late 2022 the team at [Nango](https://www.nango.dev) adopted the project and has since maintained and evolved it together with the growing Nango community.

## What are product integrations?

**Product integrations** *(noun)*: The capability within a software product that enables users to connect their external accounts (such as third-party SaaS tools or APIs) to your application, allowing for secure data exchange and interoperability between systems.