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

## Use Nango Cloud

To get a Cloud instance fill out the brief [form here](https://nango.dev/start). Then check your email for your instance URL and secret key.

To use the cloud instance, first connect the Nango CLI (see next paragraph).  
Then go through the [Quickstart](quickstart.md), but replace the instructions for instantiating the frontend and backend SDK with the code snippets below.

Please don't hesitate to reach out on our [Slack community](https://nango.dev/slack) if you run into any issues!

### Connecting the Nango CLI to your cloud instance

You need to set two environment variables so the CLI can connect to your cloud instance:

-   `NANGO_HOSTPORT` = URL of your cloud instance (see instance details email)
-   `NANGO_SECRET_KEY` = your instance's secret key (see instance details email)

We recommend adding these to your `.zshrc` (or equivalent) so they load for every terminal:

```bash
export NANGO_HOSTPORT=https://nango<instance-id>.onrender.com;
export NANGO_SECRET_KEY=<secret-key>;
```

### Instantiating the frontend SDK

Use the instance URL to instantiate the Nango frontend SDK:

```ts
import Nango from '@nangohq/frontend';
var nango = new Nango('https://nango<instance-id>.onrender.com');
nango.auth('github', '<connection-id>');
```

### Instantiating the backend SDK {#backend-sdk-cloud}

Use the instance URL and the secret key to instantiate the Nango backend SDK (or API requests):

```ts
import { Nango } from '@nangohq/node';

let nango = new Nango('https://nango<instance-id>.onrender.com', '<your-secret-key>');
```
