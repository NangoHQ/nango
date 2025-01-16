import { Ok } from '@nangohq/utils';
import type { NodeProvider } from './node_provider';

export const noopNodeProvider: NodeProvider = {
    defaultNodeConfig: {
        image: 'nangohq/nango-runner',
        cpuMilli: 1000,
        memoryMb: 1000,
        storageMb: 1000
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
