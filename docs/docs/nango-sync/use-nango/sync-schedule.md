import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Sync Scheduling

### Cron-style scheduling

You can set Syncs to run at a fixed time by using the cron notation, with the `cron` parameter in the [Sync config options](sync-all-options.md).

### Unaligned frequency

Alternatively, you can configure a Sync's frequency with the `frequency` parameter in the [Sync config options](sync-all-options.md). For a full list of supported formats check the [examples here](https://github.com/vercel/ms#readme).

:::tip
If no scheduling is specified for a Sync, it will run with a 1-hour frequency by default.
:::

## Problems with your Sync? We are here to help!

If you need help or run into issues, please reach out! We are online and responsive all day on the [Slack Community](https://nango.dev/slack).