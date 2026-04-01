import { envs } from '../env.js';

import type { NangoProps, RoutingContext } from '@nangohq/types';

export function getRoutingId(params: { nangoProps: NangoProps; routingContext?: RoutingContext | undefined }): string {
    const tshirtSize = getTShirtSize(params);
    const prefix = params.routingContext?.plan?.fleet_node_routing_override || envs.LAMBDA_DEFAULT_PREFIX;
    return `${prefix}-${tshirtSize}`;
}

function getTShirtSize(_params: { nangoProps: NangoProps; routingContext?: RoutingContext | undefined }): string {
    //t-shirt size will be retrieved from nangoProps or routingContext as specified by the customer
    //for now, we will just use the default memory size
    const memoryMb = envs.LAMBDA_DEFAULT_MEMORY_MB;
    if (memoryMb < 1024) return 'S';
    if (memoryMb < 2048) return 'M';
    if (memoryMb < 4096) return 'L';
    if (memoryMb < 8192) return 'XL';
    return 'XXL';
}
