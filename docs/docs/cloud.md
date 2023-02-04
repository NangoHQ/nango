# Nango Cloud

## Features

-   Auto-scaling: We make sure Nango scales, no matter the load you throw at it
-   Auto-updates: Always enjoy the latest & greatest provider templates with no work
-   Encryption at rest
-   SSL
-   Server authentication: Access is protected with a secret key
-   Monitoring & alerting (soon)
-   Admin panel for handling configs & metrics (soon)
-   Production-grade support & 24h turnaround to implement new integrations

Other feature ideas or questions? We would love to help or hear your input on the [Slack community](https://nango.dev/slack)!

## Get Started

[Sign up](https://nango.dev/start) to Nango Cloud and check your emails for an instance URL and secret key.

On your local machine, add these two lines to your `.zshrc` or `.bashrc`:

```bash
export NANGO_HOSTPORT=INSTANCE_URL;
export NANGO_SECRET_KEY=SECRET_KEY;
```

❗️Restart your console to activate the new config

You can now follow the instructions from the [Quickstart](quickstart) or more detailed [Step-By-Step Guide](guide), with a couple differences:

-   You don't need to clone and start Nango
-   Replace `http://localhost:3003` by your instance URL
-   Initialize the Node SDK with the secret: `new Nango(INSTANCE_URL, SECRET_KEY)` (or if you're using the Nango REST API, use [Simple Auth](https://en.wikipedia.org/wiki/Basic_access_authentication) or [ask us](https://nango.dev/slack))
