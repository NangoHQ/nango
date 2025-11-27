import { Ok } from '@nangohq/utils';

import type { NodeProvider } from '@nangohq/fleet';

export const lambdaNodeProvider: NodeProvider = {
    defaultNodeConfig: {
        cpuMilli: 500,
        memoryMb: 512,
        storageMb: 20000,
        isTracingEnabled: false,
        isProfilingEnabled: false,
        idleMaxDurationMs: 0 // No auto-shutdown for local runners
    },
    start: async (_node) => {
        return Promise.resolve(Ok(undefined));
    },
    terminate: async (_node) => {
        return Promise.resolve(Ok(undefined));
    },
    verifyUrl: async (_url) => {
        return Promise.resolve(Ok(undefined));
    }
};
