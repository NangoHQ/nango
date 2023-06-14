```diff
+ Looking for Pizzly? You are in the right place. Pizzly has been renamed Nango. +
```

<div align="center">
  
<img src="/assets/nango-logo.png?raw=true" width="350">

</div>

<h1 align="center">Open-Source Product Integrations</h1>

<div align="center">
Build the integrations your customers need. Simplify your codebase. Sleep at night.
</div>

<p align="center">
    <br />
    <a href="https://docs.nango.dev/" rel="dofollow"><strong>Explore the docs »</strong></a>
    <br />

  <br/>
    <a href="https://nango.dev/integrations">Pre-Configured APIs</a>
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

## ⭐ Nango at a glance

Nango is a new way of building product integrations:

-   as **powerful** as building yourself
-   as **fast** as buying a pre-built solution

It supports:

-   🔐 Managed auth
-   🔁 Bi-directional syncing
-   🚫 Rate-limits & retries
-   📄 Pagination
-   🧠 Strong typing
-   🪝 Webhooks
-   👀 Monitoring
-   📺 Admin console

We built the [hard infrastructure](https://docs.nango.dev/core-concepts#infra), so you don't have to.

## 👩‍💻 How it looks in my code

-   1-liner to start a new OAuth flow:

```js
nango.auth('github', '<user-id>');
```

-   1-liner to fetch structured objects from any external API:

```js
nango.github().issues('<user-id>');
```

## 100+ pre-configured APIs, easily add your own

Nango works with **any** API and use-case. Adding [API Configurations](https://docs.nango.dev/core-concepts#api-configuration) is easy and we already have the main APIs covered.

100+ APIs are pre-configured to work out-of-the-box, including:

-   **CRM**: Front, Hubspot, Salesforce, etc.
-   **Accounting**: Xero, Sellsy, Zoho Books, etc.
-   **Fintech:** Brex, Stripe, Braintree, Ramp etc.
-   **Developer tools**: GitHub, GitLab, Linear, Jira etc.
-   **Communication**: Gmail, Microsoft Teams, Slack, Discord, Zoom etc.
-   **Productivity**: Asana, Airtable, Google Drive, Google Calendar, Trello,
    GSheet, ClickUp etc.
-   **Social**: Twitter, LinkedIn, Reddit, Facebook etc.
-   [and more...](https://nango.dev/integrations)

If your favorite API is missing
[open a GitHub issue](https://github.com/NangoHQ/nango/issues/new) or
[contribute it](https://docs.nango.dev/contribute).

## 📺 Demo

<a href="https://www.youtube.com/watch?v=BK15QI-jWi0">
  <img src="https://uploads-ssl.webflow.com/63c092e946f9b71ff6874169/641e4d295d27291494411377_youtube-thumbnail.jpg" width="500">
</a>

## 🚀 Quickstart

Run locally:

```shell
git clone https://github.com/NangoHQ/nango.git && cd nango && docker compose up
```

Or sign up for free:

<a href="https://app.nango.dev/signup" target="_blank">
  <img src="https://raw.githubusercontent.com/NangoHQ/nango/6f49ab92c0ffc18c1d0f44d9bd96c62ac97aaa8d/docs/static/img/nango-deploy-button.svg" alt="Try Nango Cloud" width="215"/>
</a>

## 🔍 Where to learn more

-   Explore the [documentation](https://docs.nango.dev)
-   Share feedback or ask questions on the [Slack community](https://nango.dev/slack)
-   [Contribute a new API](https://docs.nango.dev/contribute)
-   Check out our [blog on native integrations](https://www.nango.dev/blog)

## 💪 Contributors

Thank you for continuously making Nango better ❤️

<a href="https://github.com/nangohq/nango/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nangohq/nango" />
</a>

## 🐻 History

Pizzly (a simple service for OAuth) was initially developed by the team at [Bearer](https://www.bearer.com/?ref=pizzly) with contributions of more than 40 individuals. Over time the focus of Bearer shifted and they could no longer maintain Pizzly. In late 2022 the team at [Nango](https://www.nango.dev) adopted the project and has since maintained and evolved it together with the growing Nango community.
