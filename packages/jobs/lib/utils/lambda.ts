import { envs } from '../env.js';

import type { NangoProps } from '@nangohq/types';

export function getSizeFromProps(_nangoProps: NangoProps): number {
    //based on available props return a memory size compatible with lambda - will use rules for this
    return envs.LAMBDA_DEFAULT_SIZE;
}

export function getSizeFromRoutingId(name: string): number {
    const parts = name.split('-');
    const size = Number.parseInt((parts.length && parts[parts.length - 1]) || '');
    if (Number.isNaN(size)) return envs.LAMBDA_DEFAULT_SIZE;
    return size;
}

export function getRoutingId(nangoProps: NangoProps): string {
    const size = getSizeFromProps(nangoProps);
    return `nango-runner-function-${size}`;
}
