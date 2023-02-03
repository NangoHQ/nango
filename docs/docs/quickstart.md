---
sidebar_label: Quickstart
---

# 🚀 Quickstart

In <5mins, learn how to access & manage OAuth tokens for any API, using Github as an example. Ready? Go! ⏰

First, clone and start Nango:

```bash
git clone https://github.com/NangoHQ/quickstart.git && cd quickstart
docker compose up
```

In a new console, add any Github OAuth App to Nango (optionally [register your own Github OAuth App](https://docs.github.com/en/developers/apps/building-oauth-apps/creating-an-oauth-app)):

```bash
npx nango config:create github-dev github 57876b21174fed02b905 e43242c9a67fa06141e8d219c2364283d14f9ad1 "user,public_repo"
```

Authorize Github on this [example page](https://docs.nango.dev/demo/github). Nango securely retrieves, stores and refreshes OAuth credentials. Now try:

```bash
npx token:get 1 github-dev
```

Congrats 🥳 You have a fresh token to access the Github API! Let's fetch the repos of any user (❗️replace `TOKEN`):

```bash
curl -XGET -G "https://api.github.com/users/bastienbeurier/repos" -H "Authorization: Bearer TOKEN"
```

(In practice, you probably want to use our [backend SDKs](https://docs.nango.dev/reference/guide#node-sdk) to fetch tokens from your codebase.)

Wanna to go live? Check out the [Self-Hosted](category/deploy-nango-sync-open-source) or [Cloud](cloud) options!
