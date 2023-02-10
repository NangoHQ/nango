# Nango Cloud

Nango Cloud is hosted and managed by Nango.

## Cloud Features

-   Auto-scaling: We make sure Nango scales, no matter the load you throw at it
-   Auto-updates: Always enjoy the latest & greatest provider templates with no work
-   Encryption at rest
-   SSL
-   Server authentication: Access is protected with a secret key
-   Monitoring & alerting (soon)
-   Admin panel for handling configs & metrics (soon)
-   Production-grade support & 24h turnaround to implement new integrations

Other feature ideas or questions? We would love to help or hear your input on the [Slack community](https://nango.dev/slack)!

## 🚀 Cloud Quickstart {#quickstart}

In <5mins, learn how to access & manage OAuth tokens for any API, using Github as an example. Ready? Go! ⏰

[Sign up](https://nango.dev/start) to Nango Cloud (no credit card required) and get your `Server URL` and `Secret` (don't share!).

On your local machine, configure them as environment variables (in your `.zshrc` or `.bashrc`):

```bash
export NANGO_HOSTPORT=SERVER_URL # Replace
export NANGO_SECRET_KEY=SECRET # Replace
```

**Restart your console** and add a new Github OAuth App (created by us) to Nango:

```bash
npx nango config:create github-cloud github 2682fa17f945844c2586 6d0f95b851a9d37c03f548762a9133ac87455f22 "public_repo"
```

Complete the Github [OAuth flow](https://docs.nango.dev/demo/github-cloud). Nango will securely retrieve, store and refresh OAuth credentials. Now try:

```bash
npx nango token:get 1 github-cloud
```

Congrats 🥳 You have a fresh token to access the Github API! Let's make sure it works (❗️replace `TOKEN`):

```bash
curl -XGET -G "https://api.github.com/users/bastienbeurier/repos" \
    -H "Authorization: Bearer TOKEN"
```

(In practice, you should use our [backend SDK](https://docs.nango.dev/reference/guide#node-sdk) or [REST API](https://docs.nango.dev/reference/guide#rest-api) to fetch tokens from your codebase.)

Wanna go live? Go through the more detailed [Step-By-Step Guide](reference/guide.md).
