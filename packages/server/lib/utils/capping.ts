import { getCapping } from '@nangohq/account-usage';

import { envs } from '../env.js';

export const capping = await getCapping(envs.NANGO_REDIS_URL, { enabled: envs.USAGE_CAPPING_ENABLED });
