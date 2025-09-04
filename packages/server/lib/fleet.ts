import { Fleet } from '@nangohq/fleet';

import { envs } from './env.js';

export const runnersFleet = new Fleet({ fleetId: envs.RUNNER_FLEET_ID });
