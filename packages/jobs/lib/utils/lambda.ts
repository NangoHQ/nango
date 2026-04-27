import { envs } from '../env.js';

import type { Node } from '@nangohq/fleet';
import type { NangoProps, RoutingContext } from '@nangohq/types';

/** Routing ids for tenant-isolated Lambdas end with this segment (see {@link getRoutingId}). */
export const TENANT_ISOLATED_ROUTING_SUFFIX = '-isolated';

export function isTenantIsolatedRoutingId(routingId: string): boolean {
    return routingId.endsWith(TENANT_ISOLATED_ROUTING_SUFFIX);
}

export function getFunctionName(node: Node): string {
    if (isTenantIsolatedRoutingId(node.routingId)) {
        const base = node.routingId.slice(0, -TENANT_ISOLATED_ROUTING_SUFFIX.length);
        return `${base}-${node.id}${TENANT_ISOLATED_ROUTING_SUFFIX}`;
    }
    return `${node.routingId}-${node.id}`;
}

export function getRoutingId(params: { nangoProps: NangoProps; routingContext?: RoutingContext | undefined }): string {
    const tshirtSize = getTShirtSize(params);
    const prefix = params.routingContext?.plan?.fleet_node_routing_override || envs.LAMBDA_DEFAULT_PREFIX;
    const base = `${prefix}-${tshirtSize}`;
    if (params.routingContext?.plan?.tenant_isolation) {
        return `${base}-isolated`;
    }
    return base;
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
