import { Capping, getUsageTracker } from '@nangohq/account-usage';

import { envs } from '../env.js';

const usageTracker = await getUsageTracker(envs.NANGO_REDIS_URL);
export const capping = new Capping(usageTracker, { enabled: envs.USAGE_CAPPING_ENABLED });
