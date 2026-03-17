import { envs } from '../env.js';

import type { NangoProps, RoutingContext } from '@nangohq/types';

export function getRoutingId(params: { nangoProps: NangoProps; routingContext?: RoutingContext | undefined }): string {
    const tshirtSize = getTShirtSize(params.nangoProps);
    const prefix = params.routingContext?.plan?.node_routing_override || envs.LAMBDA_DEFAULT_PREFIX;
    return `${prefix}-${tshirtSize}`;
}

function getTShirtSize(_nangoProps: NangoProps): string {
    const memoryMb = envs.LAMBDA_DEFAULT_MEMORY_MB;
    if (memoryMb < 1024) return 'S';
    if (memoryMb < 2048) return 'M';
    if (memoryMb < 4096) return 'L';
    if (memoryMb < 8192) return 'XL';
    return 'XXL';
}
