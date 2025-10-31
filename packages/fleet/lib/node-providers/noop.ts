import { Ok } from '@nangohq/utils';

import type { NodeProvider } from './node_provider.js';

export const noopNodeProvider: NodeProvider = {
    defaultNodeConfig: {
        cpuMilli: 1000,
        memoryMb: 1000,
        storageMb: 1000,
        isTracingEnabled: false,
        isProfilingEnabled: false
    },
    start: () => {
        return Promise.resolve(Ok(undefined));
    },
    terminate: () => {
        return Promise.resolve(Ok(undefined));
    },
    verifyUrl: () => {
        return Promise.resolve(Ok(undefined));
    }
};
