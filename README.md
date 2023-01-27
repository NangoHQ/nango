```diff
+ Looking for Pizzly? You are in the right place. Pizzly has been renamed Nango. Using Pizzly v0.2.x? Please read this about migrating to Nango v0.3+: https://docs.nango.dev/pizzly/migration +
```

<div align="center">
  
<img src="/assets/nango-logo.png?raw=true" width="350">

</div>

<h1 align="center">Access to OAuth APIs. Fast & secure.</h1>

<div align="center">
Nango takes care of the OAuth dance for you and makes sure your access tokens always stay fresh.
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
    <a href="https://nango.dev/slack">Community Slack</a>
</p>

## ⭐ Nango at a glance

Nango is a small, self-contained service (docker container) that contains everything you need to work with APIs that use OAuth.

Nango has been designed for modern web apps/backends and contains:

-   a full OAuth 2 and OAuth 1.0a dance implementation for 50+ APIs (and more coming)
-   a frontend SDK that makes it easy to trigger new OAuth flows from your web app
-   a backend SDK & REST API that make it easy to get always-fresh access tokens for your API calls
-   a CLI that makes it easy to manage your OAuth provider configs, setup different environments and debug OAuth issues

Nango is easy to try in 5 minutes and can be deployed in 15.

Start a **new OAuth flow with 1 line of code in your frontend**:

```ts
// Trigger an OAuth flow for the user to authenticate with Slack
let result = await new Nango().auth('slack', '<user-id>');
```

Then **get and use the current access token in your backend** (with our SDK or a simple REST API):

```ts
var slackAccessToken = await nango.getToken('slack', '<user-id>'); // Always fresh & ready to use
```

## 👾 Out of the box support for 50+ APIs

More than 50 APIs are preconfigured to work out-of-the-box. Including:

-   **CRM**: Front, Hubspot, Salesforce, etc.
-   **Accounting**: Xero, Sellsy, Zoho Books, etc.
-   **Developer tools**: GitHub, GitLab, Linear, Jira etc.
-   **Communication**: Gmail, Microsoft Teams, Slack, Zoom etc.
-   **Productivity**: Asana, Airtable, Google Drive, Google Calendar, Trello, Google sheets, ClickUp etc.
-   **Social**: Twitter, LinkedIn, Reddit, Facebook etc.
-   [and more...](https://nango.dev/oauth-providers)

If your favorite API is missing [open a GitHub issue](https://github.com/NangoHQ/nango/issues/new) or [contribute it right away](https://docs.nango.dev/contribute-api): The API configurations are just simple [entries in a YAML file](https://www.nango.dev/oauth-providers).

## 🛡️ Small, self-contained & ready for production

We built Nango because we wanted a simple and fast way to get (fresh) access tokens for any API that requires OAuth.

On purpose Nango is small, focused on its one task and easy to deploy in production:

-   It runs as a single docker container in your stack
-   Updating it is as simple as `docker pull` and restarting the container
-   Securing it for production is quick & easy
-   Our CLI helps you with all admin tasks (such as setting scopes, enabling APIs etc.)

Last but not least, Nango's active community continuously expands & updates the 50+ blueprints. So your OAuth flows & tokens will keep on working even 5 years down the road.

## 🚀 Quickstart

Clone the repo and start Nango:

```bash
git clone https://github.com/NangoHQ/nango.git
cd nango
docker compose up
```

Make sure you have a client ID & secret ready for the API you want to use, e.g. for GitHub [register it here](https://docs.github.com/en/developers/apps/building-oauth-apps/creating-an-oauth-app). Use `http://localhost:3003/oauth/callback` as the callback URL.

Enable the GitHub API and add your OAuth client id & secret with the CLI (make sure to run this outside of the cloned nango repo):

```bash
npx nango config:create github github <client-id> <client-secret> "user,public_repo"
```

CD to the demo page and start a small webserver to serve the demo page:

```bash
cd packages/frontend
python3 -m http.server 8080
```

Open the demo page in your browser at [http://localhost:8080/bin/quickstart.html](http://localhost:8080/bin/quickstart.html) and try the OAuth flow with `github` as the config key and `1` as the connection id.

Once the flow is finished you can use our SDKs or REST API to get access tokens in the backend (automatically refreshed) and make API calls:

```ts
import { Nango } from '@nangohq/node';
let nango = new Nango();
var githubAccessToken = await nango.accessToken('github', '1'); // Always fresh & ready to use
```

When you are ready to add Nango to your application read our [Getting started](https://docs.nango.dev/quickstart) guide.

## 🔍 Where to learn more

⭐  Follow our development by starring us here on GitHub ⭐

-   Explore [the full list of supported APIs](https://nango.dev/oauth-providers)
-   [Contribute a new API](https://docs.nango.dev/contribute-api)
-   Share feedback or ask questions on the [Slack community](https://nango.dev/slack)
-   Check our [blog on native integrations](https://www.nango.dev/blog)

## 🐻 History

Pizzly was originally developed by the team at [Bearer](https://www.bearer.com/?ref=pizzly) with contributions of more than 40+ individuals. Over time the focus of Bearer shifted and they could no longer maintain Pizzly. In late 2022 the team at [Nango](https://www.nango.dev) adopted the project and has since maintained and evolved it together with the growing Nango community.
