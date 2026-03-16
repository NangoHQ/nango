import { envs } from '../env.js';

import type { NangoProps, RuntimeContext } from '@nangohq/types';

export function getSizeFromProps(_nangoProps: NangoProps): number {
    //based on available props return a memory size compatible with lambda - will use rules for this
    return envs.LAMBDA_DEFAULT_SIZE;
}

export function getRoutingId(params: { nangoProps: NangoProps; runtimeContext?: RuntimeContext | undefined }): string {
    const size = getSizeFromProps(params.nangoProps);
    const tshirtSize = getTShirtSize(size);
    const prefix = params.runtimeContext?.plan?.node_routing_override || envs.LAMBDA_PREFIX;
    return `${prefix}-${tshirtSize}`;
}

function getTShirtSize(size: number): string {
    if (size <= 1024) return 'S';
    if (size <= 2048) return 'M';
    if (size <= 4096) return 'L';
    if (size <= 8192) return 'XL';
    return 'XXL';
}
