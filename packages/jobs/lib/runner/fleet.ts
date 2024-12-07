import type { NodeProvider } from '@nangohq/fleet';
import { Fleet } from '@nangohq/fleet';
import { envs } from '../env.js';
import { localNodeProvider } from './local.js';

const nodeProvider: NodeProvider | undefined = envs.RUNNER_TYPE === 'LOCAL' ? localNodeProvider : undefined;

export const runnersFleet = new Fleet({ fleetId: 'nango_runners', nodeProvider });
