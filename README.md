```diff
+ Looking for Pizzly? You are in the right place. Pizzly has been renamed Nango. +
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
-   [Cloud hosting available](https://www.nango.dev/pricing)

Nango's community continuously maintains & expands API templates.

## 🚀 Quickstart

### 1 -click deploy

Deploy Nango with 1-click (free options available)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/NangoHQ/nango-render)
<a href="https://heroku.com/deploy?template=https://github.com/NangoHQ/nango-heroku">
  <img src="https://www.herokucdn.com/deploy/button.svg" alt="Deploy to heroku" width="200">
</a>
<a href="https://nango.dev/start">
  <img src="https://raw.githubusercontent.com/NangoHQ/nango/6f49ab92c0ffc18c1d0f44d9bd96c62ac97aaa8d/docs/static/img/nango-deploy-button.svg" alt="Try Nango Cloud" width="215">
</a>

<!--- need to use html 'a' tag here to ensure that the button sizes are the same --->

### Run locally

In <5mins, learn how to access & manage OAuth tokens for any API, using Github as an example. Ready? Go! ⏰

First, clone and start Nango:

```bash
git clone https://github.com/NangoHQ/nango-quickstart.git && cd nango-quickstart
```

```bash
docker compose up # Keep the tab open
```

In a new tab, add any Github OAuth App to Nango (optionally [register your own Github OAuth App](https://docs.github.com/en/developers/apps/building-oauth-apps/creating-an-oauth-app)):

```bash
npx nango config:create github-dev github 57876b21174fed02b905 e43242c9a67fa06141e8d219c2364283d14f9ad1 "public_repo"
```

Complete the Github [OAuth flow](https://docs.nango.dev/demo/github). Nango will securely retrieve, store and refresh OAuth credentials. Now try:

```bash
npx nango token:get github-dev 1
```

Congrats 🥳 You have a fresh token to access the Github API! Let's make sure it works (❗️replace `<TOKEN>`):

```bash
curl "https://api.github.com/users/bastienbeurier/repos" -H "Authorization: Bearer <TOKEN>"
```

(In practice, you should use our [backend SDK](https://docs.nango.dev/reference/guide#node-sdk) or [REST API](https://docs.nango.dev/reference/guide#rest-api) to fetch tokens from your codebase.)

Wanna go live? Go through the more detailed [Step-By-Step Guide](https://docs.nango.dev/reference/guide). You can [self-host Nango](https://docs.nango.dev/category/deploy-nango-sync-open-source) or use [Nango Cloud](https://docs.nango.dev/cloud).

## 🔍 Where to learn more

-   Explore [the full list of supported APIs](https://nango.dev/oauth-providers)
-   Explore the [documentation](https://docs.nango.dev)
-   [Contribute a new API](https://docs.nango.dev/contribute-api)
-   Share feedback or ask questions on the [Slack community](https://nango.dev/slack)
-   Check out our [blog on native integrations](https://www.nango.dev/blog)

## 💪 Contributors

Thank you for continuously making Nango better ❤️

<a href="https://github.com/NangoHQ/nango/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=NangoHQ/nango" />
</a>

## 🐻 History

Pizzly (the original name of this project) was initially developed by the team at [Bearer](https://www.bearer.com/?ref=pizzly) with contributions of more than 40 individuals. Over time the focus of Bearer shifted and they could no longer maintain Pizzly. In late 2022 the team at [Nango](https://www.nango.dev) adopted the project and has since maintained and evolved it together with the growing Nango community.
