<div align="center">

<img src="/assets/nango-logo.png?raw=true" width="350">

</div>

<h1 align="center">API access for AI agents & apps</h1>

<div align="center">
Easily integrate your AI agents & SaaS product with 600+ APIs.
</div>

<p align="center">
    <br />
    <a href="https://nango.dev/docs/" rel="dofollow"><strong>Explore the docs »</strong></a>
    <br />

  <br/>
    <a href="https://nango.dev/integrations">600+ supported APIs</a>
    ·
    <a href="https://nango.dev">Website</a>
    ·
    <a href="https://nango.dev/slack">Slack Community</a>
</p>

## Integration primitives

Nango provides a set of powerful primitives that you can combine to build any integration:

- **[Auth](https://nango.dev/docs/guides/primitives/auth)**: Managed API authorization for [600+ APIs](https://www.nango.dev/api-integrations)
- **[Proxy](https://nango.dev/docs/guides/primitives/proxy)**: Query APIs via Nango with credentials injection
- **[Functions](https://nango.dev/docs/guides/primitives/functions)**: Build custom integrations in code with a scalable runtime

## Flexible use cases

Flexible by design, Nango never constrains the integrations you need to build:

- **[Tool calling](https://nango.dev/docs/implementation-guides/use-cases/tool-calling/overview)**
- **[MCPs](https://nango.dev/docs/implementation-guides/use-cases/tool-calling/implement-mcp-server)**
- **[Data syncing & RAG](https://nango.dev/docs/implementation-guides/use-cases/syncs/implement-a-sync)**
- **[Triggers](https://nango.dev/docs/implementation-guides/use-cases/syncs/implement-a-sync)**
- **[Real-time webhooks](https://nango.dev/docs/implementation-guides/use-cases/webhooks-from-external-apis)**
- **[Per customer configs](https://nango.dev/docs/implementation-guides/use-cases/customer-configuration)**
- **[Unified APIs](https://nango.dev/docs/implementation-guides/use-cases/unified-apis)**

## Why Nango?

We believe teams should build their own integrations, but with better primitives.

By leveraging Nango, developers can save weeks per integration:

- **Fast**: Avoid rebuilding hard infrastructure & per-API tools.
- **Flexible**: Code-based integrations with full access to external APIs.
- **Dev-centric**: API-first & infrastructure as code for mature development workflows.
- **Reliable**: Production-ready primitives from day one.
- **Secure**: Secure handling of credentials and user data.
- **Observable**: Full visibility into every API interaction.
- **Modular**: Use only what you need, without vendor lock-in.
- **Proven at scale**: Powers millions of users for companies like Replit, Mercor, Exa, etc.

## Getting started

Authorize any API in minutes:

1. **Configure an integration**: [Sign up](https://app.nango.dev/signup) (free, no credit card) then set up a new integration in the **Integrations** tab.
2. **Authorize the API**: On the **Connections** tab, create a new connection and complete the auth flow. Later, embed the auth flow in your product:
    ```typescript
    nango.openConnectUI({ onEvent: (event) => { /* handle completion */ } });
    ```
3. **Access the API**: Retrieve the API credentials from your connection:

```typescript
import { Nango } from '@nangohq/node';

const nango = new Nango({ secretKey: '<NANGO-SECRET-KEY>' });

const connection = await nango.getConnection(
    '<INTEGRATION-ID>',
    '<CONNECTION-ID>'
);

console.log(connection.credentials);
```

Next, follow the [Auth implementation guide](https://nango.dev/docs/implementation-guides/platform/auth/implement-api-auth), make requests with the [Proxy](https://nango.dev/docs/guides/primitives/proxy), or implement custom integrations with [Functions](https://nango.dev/docs/guides/primitives/functions).

## Open-source vs. paid

Nango is offered under the [Elastic license](https://github.com/NangoHQ/nango/blob/master/LICENSE). Our Cloud and Enterprise Self-Hosted versions let you access all features, according to your [plan](https://www.nango.dev/pricing). You can also [self-host it for free](https://nango.dev/docs/guides/platform/free-self-hosting/configuration) with a limited feature set.

## Contributors

Anybody can [contribute support for a new API](https://nango.dev/docs/implementation-guides/platform/auth/contribute-new-api).

Thank you for continuously making Nango better ❤️

<a href="https://github.com/nangohq/nango/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nangohq/nango" />
</a>
