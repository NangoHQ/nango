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

[Sign up](https://nango.dev/start) to Nango Cloud (no credit card required) and open the signup email you received from Nango.

Copy/paste the `Secret` from the signup email and run in your terminal (❗️replace `<SECRET>`):

```bash
export NANGO_HOSTPORT=https://api.nango.dev && export NANGO_SECRET=<SECRET>
```

Register a new Github OAuth App (created by us) with Nango:

```bash
npx nango config:create github-cloud github 85e9ebdf0a725e006153 2e8c1a53c9d3684fef65ce214da241a6c041dc9b "user,public_repo"
```

Copy/paste the `Public Key` from the signup email and complete the Github [OAuth flow](https://docs.nango.dev/demo/github-cloud). Nango will securely retrieve, store and refresh OAuth credentials.

Now run:

```bash
npx nango token:get github-cloud 1
```

Congrats 🥳 You have a fresh token to access the Github API! Let's make sure it works (❗️replace `<TOKEN>`):

```bash
curl "https://api.github.com/users/bastienbeurier/repos" -H "Authorization: Bearer <TOKEN>"
```

(In practice, you should use our [backend SDK](https://docs.nango.dev/reference/guide#node-sdk) or [REST API](https://docs.nango.dev/reference/guide#rest-api) to fetch tokens from your codebase.)

Wanna better understand what happened? Go through the more detailed [Step-By-Step Guide](reference/guide.md).
