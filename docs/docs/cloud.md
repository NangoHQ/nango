# Nango Cloud

## Features

- Auto-scaling: We make sure Nango scales, no matter the load you throw at it
- Auto-updates: Always enjoy the latest & greatest provider templates with no work
- Encryption at rest
- SSL
- Server authentication: Access is protected with a secret key
- Monitoring & alerting (soon)
- Admin panel for handling configs & metrics (soon)
- Production-grade support & 24h turnaround to implement new integrations

Other feature ideas or questions? We would love to help or hear your input on the [Slack community](https://nango.dev/slack)!

## Use Nango Cloud

To get a Cloud instance fill out the brief [form here](https://nango.dev/start). Then check your email for your instance URL and secret key.

To use the cloud instance go through the [Quickstart](quickstart.md). You will need to replace the `http://localhost:3003` parts with the URL of your cloud instance.

### Instantiating the frontend SDK
Use the instance URL to instantiate the Nango frontend SDK:

```ts
import Nango from '@nangohq/frontend';
var nango = new Nango('https://nango<instance-id>.onrender.com');
nango.auth('github', '<connection-id>');
```

### Instantiating the backend SDK
Use the instance URL and the secret key to instantiate the Nango backend SDK (or API requests):

```ts
import { Nango } from '@nangohq/node'

let nango = new Nango('https://nango<instance-id>.onrender.com', '<your-secret-key>');
```

### Using the Nango CLI
Set the instance URL and the secret key as local environment variables `NANGO_HOSTPORT` and `NANGO_SECRET_KEY` to use the [Nango CLI](reference/cli.md). We recommend adding these to your `.zshrc` (or equivalent) so they load for every terminal.

```bash
export NANGO_HOSTPORT=https://nango<instance-id>.onrender.com;
export NANGO_SECRET_KEY=<secret-key>;
```

