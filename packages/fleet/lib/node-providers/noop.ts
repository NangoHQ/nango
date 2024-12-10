import { Ok } from '@nangohq/utils';
import type { NodeProvider } from './node_provider';
import type { NodeConfig } from '@nangohq/types';

export const noopNodeProvider: NodeProvider = {
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

export const noopNodeConfig: NodeConfig = {
    image: 'my-image',
    cpuMilli: 1000,
    memoryMb: 1000,
    storageMb: 1000
};
