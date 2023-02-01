```diff
+ Looking for Pizzly? You are in the right place. Pizzly has been renamed Nango. Using Pizzly v0.2.x? Check out: https://docs.nango.dev/migration +
```

<div align="center">
  
<img src="/assets/nango-logo.png?raw=true" width="350">

</div>

<h1 align="center">Get OAuth tokens for APIs. Fast & secure.</h1>

<div align="center">
Pre-built OAuth flows & secure token management for 40+ APIs. 100% open source.
</div>

<p align="center">
    <br />
    <a href="https://docs.nango.dev/" rel="dofollow"><strong>Explore the docs »</strong></a>
    <br />

  <br/>
    <a href="https://nango.dev/oauth-providers">All supported APIs</a>
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

-   a full OAuth dance for 40+ APIs
-   a frontend SDK to trigger new OAuth flows
-   a backend SDK & REST API to retrieve fresh access tokens for your API calls

Nango is easy to try in 5 minutes and can be deployed in 15:

-   1-liner to start a new OAuth flow in your frontend:

```ts
let result = await nango.auth('github', '<user-id>');
```

-   1-liner to retrieve a token (with our SDK or REST API):

```ts
let token = await nango.getToken('github', '<user-id>');
```

## 👾 Out of the box support for 40+ APIs

40+ APIs are preconfigured to work out-of-the-box. Including:

-   **CRM**: Front, Hubspot, Salesforce, etc.
-   **Accounting**: Xero, Sellsy, Zoho Books, etc.
-   **Developer tools**: GitHub, GitLab, Linear, Jira etc.
-   **Communication**: Gmail, Microsoft Teams, Slack, Zoom etc.
-   **Productivity**: Asana, Airtable, Google Drive, Google Calendar, Trello, Google sheets, ClickUp etc.
-   **Social**: Twitter, LinkedIn, Reddit, Facebook etc.
-   [and more...](https://nango.dev/oauth-providers)

If your favorite API is missing [open a GitHub issue](https://github.com/NangoHQ/nango/issues/new) or [contribute it right away](https://docs.nango.dev/contribute-api): The API configurations are just simple [entries in a YAML file](https://www.nango.dev/oauth-providers).

## 🛡️ Small, self-contained & ready for production

Nango is purposely small, focused on its one task and easy to deploy in production:

-   Runs as a single docker container
-   Updates easily (`docker pull`)
-   Secured with an API key
-   Managed with a CLI

Nango's community continuously maintains & expands API templates.

## 🚀 Quickstart

In less than 5 minutes, you will learn how to access & manage any API's OAuth tokens, using Github as an example. Ready? Go! ⏰

First, clone and start Nango:

```bash
git clone https://github.com/NangoHQ/nango.git && cd nango
docker compose up
```

Make sure you have a client ID & secret ready for the API you want to use, in our case GitHub ([register here](https://docs.github.com/en/developers/apps/building-oauth-apps/creating-an-oauth-app), specifying `http://localhost:3003/oauth/callback` as the callback URL).

In a new terminal window, configure a new Github integration with our CLI (outside the `nango` repo):

```bash
cd ~ && npx nango config:create github github <client-id> <client-secret> "user,public_repo"
```

In a new terminal window, go to the `nango` repo and serve the demo page:

```bash
cd packages/frontend && python3 -m http.server 8000
```

Visit the demo [demo page](http://localhost:8000/bin/quickstart.html) and start an OAuth flow, using `github` as config key and `1` as connection ID.

Finally, fetch a fresh access token to start making Github API calls!

-   Option 1: Fetch the token with Nango's REST API:

```bash
curl -XGET -G 'http://localhost:3003/connection/1?provider-config_key=github'
```

-   Option 2: Fetch the token with Nango's Node SDK:

```bash
npm i @nangohq/node
```

```ts
import { Nango } from '@nangohq/node';
let nango = new Nango();
var githubAccessToken = await nango.getToken('github', '1');
```

Et voilà ! Nango will permanently store & refresh your tokens safely.

Wanna go live? Check out the [Self-Hosted](https://docs.nango.dev/category/deploy-nango-sync-open-source) or [Cloud](https://docs.nango.dev/cloud) options.

## 🔍 Where to learn more

-   Explore [the full list of supported APIs](https://nango.dev/oauth-providers)
-   [Contribute a new API](https://docs.nango.dev/contribute-api)
-   Share feedback or ask questions on the [Slack community](https://nango.dev/slack)
-   Check our [blog on native integrations](https://www.nango.dev/blog)

## 🐻 History

Pizzly was originally developed by the team at [Bearer](https://www.bearer.com/?ref=pizzly) with contributions of more than 40+ individuals. Over time the focus of Bearer shifted and they could no longer maintain Pizzly. In late 2022 the team at [Nango](https://www.nango.dev) adopted the project and has since maintained and evolved it together with the growing Nango community.
