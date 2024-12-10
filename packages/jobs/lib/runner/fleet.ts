import { Fleet } from '@nangohq/fleet';
import { envs } from '../env.js';
import { localNodeProvider } from './local.js';
import { renderNodeProvider } from './render.js';

const defaultNodeConfig = {
    image: 'nangohq/nango-runner',
    cpuMilli: 500,
    memoryMb: 512,
    storageMb: 20000
};

const fleetId = 'nango_runners';
export const runnersFleet = (() => {
    switch (envs.RUNNER_TYPE) {
        case 'LOCAL':
            return new Fleet({ fleetId, nodeSetup: { nodeProvider: localNodeProvider, defaultNodeConfig } });
        case 'RENDER':
            return new Fleet({ fleetId, nodeSetup: { nodeProvider: renderNodeProvider, defaultNodeConfig } });
        default:
            return new Fleet({ fleetId });
    }
})();
