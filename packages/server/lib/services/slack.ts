import { getFeatureFlagsClient } from '@nangohq/kvstore';
import { logContextGetter } from '@nangohq/logs';
import { SlackService } from '@nangohq/shared';

export const slackService = new SlackService({
    logContextGetter: logContextGetter,
    featureFlags: await getFeatureFlagsClient()
});
