import { Fleet } from '@nangohq/fleet';
import { envs } from '../env.js';
import { localNodeProvider } from './local.js';
import { renderNodeProvider } from './render.js';

const fleetId = 'nango_runners';
export const runnersFleet = (() => {
    switch (envs.RUNNER_TYPE) {
        case 'LOCAL':
            return new Fleet({ fleetId, nodeProvider: localNodeProvider });
        case 'RENDER':
            return new Fleet({ fleetId, nodeProvider: renderNodeProvider });
        default:
            return new Fleet({ fleetId });
    }
})();
