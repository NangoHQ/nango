import { Ok } from '@nangohq/utils';

import type { NodeProvider } from './node_provider.js';

export const noopNodeProvider: NodeProvider = {
    defaultNodeConfig: {
        cpuMilli: 1000,
        memoryMb: 1000,
        storageMb: 1000,
        isTracingEnabled: false,
        isProfilingEnabled: false,
        idleMaxDurationMs: 1_800_000,
        executionTimeoutSecs: -1,
        provisionedConcurrency: -1
    },
    start: () => {
        return Promise.resolve(Ok(undefined));
    },
    terminate: () => {
        return Promise.resolve(Ok(undefined));
    },
    verifyUrl: () => {
        return Promise.resolve(Ok(undefined));
    },
    finish: () => {
        return Promise.resolve(Ok(undefined));
    }
};
