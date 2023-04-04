```diff
+ Looking for Pizzly? You are in the right place. Pizzly has been renamed Nango. +
```

<div align="center">
  
<img src="/assets/nango-logo.png?raw=true" width="350">

</div>

<h1 align="center">Get OAuth tokens for APIs. Fast & secure.</h1>

<div align="center">
Pre-built OAuth flows & secure token management for 70+ APIs. 100% open source.
</div>

<p align="center">
    <br />
    <a href="https://docs.nango.dev/" rel="dofollow"><strong>Explore the docs »</strong></a>
    <br />

  <br/>
    <a href="https://nango.dev/oauth-providers">All supported APIs</a>
    ·
    <a href="https://docs.nango.dev/">Docs</a>
    ·
    <a href="https://nango.dev">Website</a>
    ·
    <a href="https://docs.nango.dev/contribute-api">Contribute an API</a>
    ·
    <a href="https://github.com/nangohq/nango/issues">Report Bug</a>
    ·
    <a href="https://nango.dev/slack">Slack Community</a>
</p>

## ⭐ Nango at a glance

Nango is a service that contains everything you need to work with APIs that use OAuth.

It contains:

-   a full OAuth dance for 70+ APIs
-   a frontend SDK to trigger new OAuth flows
-   a backend SDK & REST API to retrieve fresh access tokens for your API calls

Nango is easy to try in 5 minutes:

-   1-liner to start a new OAuth flow in your frontend:

```ts
let result = await nango.auth('github', '<user-id>');
```

-   1-liner to retrieve a fresh token (with our SDK or REST API):

```ts
let token = await nango.getToken('github', '<user-id>');
```

## 👾 Out of the box support for 70+ APIs

70+ APIs are preconfigured to work out-of-the-box. Including:

-   **CRM**: Front, Hubspot, Salesforce, etc.
-   **Accounting**: Xero, Sellsy, Zoho Books, etc.
-   **Fintech:** Brex, Stripe, Braintree, Ramp etc.
-   **Developer tools**: GitHub, GitLab, Linear, Jira etc.
-   **Communication**: Gmail, Microsoft Teams, Slack, Discord, Zoom etc.
-   **Productivity**: Asana, Airtable, Google Drive, Google Calendar, Trello, Google sheets, ClickUp etc.
-   **Social**: Twitter, LinkedIn, Reddit, Facebook etc.
-   [and more...](https://nango.dev/oauth-providers)

If your favorite API is missing [open a GitHub issue](https://github.com/NangoHQ/nango/issues/new) or [contribute it right away](https://docs.nango.dev/contribute-api): The API configurations are just simple [entries in a YAML file](https://github.com/NangoHQ/nango/blob/master/packages/server/providers.yaml).

## 📺 Demo

<a href="https://www.youtube.com/watch?v=BK15QI-jWi0">
  <img src="https://uploads-ssl.webflow.com/63c092e946f9b71ff6874169/641e4d295d27291494411377_youtube-thumbnail.jpg" width="500">
</a>

## 🚀 Quickstart

### Test Nango in 5 minutes

Run locally:

```shell
git clone https://github.com/NangoHQ/nango.git && cd nango && docker compose up # Keep the tab open
```

Or sign up for free:

<a href="https://app.nango.dev/signup" target="_blank">
  <img src="https://raw.githubusercontent.com/NangoHQ/nango/6f49ab92c0ffc18c1d0f44d9bd96c62ac97aaa8d/docs/static/img/nango-deploy-button.svg" alt="Try Nango Cloud" width="215"/>
</a>

## 🔍 Where to learn more

-   Explore [the full list of supported APIs](https://nango.dev/oauth-providers)
-   Explore the [documentation](https://docs.nango.dev)
-   [Contribute a new API](https://docs.nango.dev/contribute-api)
-   Share feedback or ask questions on the [Slack community](https://nango.dev/slack)
-   Check out our [blog on native integrations](https://www.nango.dev/blog)

## 💪 Contributors

Thank you for continuously making Nango better ❤️

<a href="https://github.com/nangohq/nango/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nangohq/nango" />
</a>

## 🐻 History

Pizzly (the original name of this project) was initially developed by the team at [Bearer](https://www.bearer.com/?ref=pizzly) with contributions of more than 40 individuals. Over time the focus of Bearer shifted and they could no longer maintain Pizzly. In late 2022 the team at [Nango](https://www.nango.dev) adopted the project and has since maintained and evolved it together with the growing Nango community.
