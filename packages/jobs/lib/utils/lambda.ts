import { envs } from '../env.js';

import type { Node } from '@nangohq/fleet';
import type { NangoProps, RoutingContext } from '@nangohq/types';

/**
 * Fleet `routing_id` suffix when the plan uses dedicated Lambda tenant isolation.
 * Matches AWS `TenancyConfig.TenantIsolationMode = PER_TENANT`; the physical function name
 * is {@link getLambdaFunctionName} so it also ends with `-isolated` after the node id.
 */
export const LAMBDA_TENANT_ISOLATION_ROUTING_SUFFIX = '-isolated';

export function isLambdaTenantIsolationRoutingId(routingId: string): boolean {
    return routingId.endsWith(LAMBDA_TENANT_ISOLATION_ROUTING_SUFFIX);
}

/** AWS `FunctionName` (and log group name segment): shared pool `routingId-id`, isolated pool `base-id-isolated`. */
export function getLambdaFunctionName(node: Node): string {
    if (isLambdaTenantIsolationRoutingId(node.routingId)) {
        const base = node.routingId.slice(0, -LAMBDA_TENANT_ISOLATION_ROUTING_SUFFIX.length);
        return `${base}-${node.id}${LAMBDA_TENANT_ISOLATION_ROUTING_SUFFIX}`;
    }
    return `${node.routingId}-${node.id}`;
}

/** Stable `TenantId` for AWS Lambda invoke when the plan uses tenant-isolated functions (PER_TENANT). */
export function getLambdaTenantId(nangoProps: NangoProps): string {
    return `account-${nangoProps.team.id}-env-${nangoProps.environmentId}`;
}

export function getRoutingId(params: { nangoProps: NangoProps; routingContext?: RoutingContext | undefined }): string {
    const tshirtSize = getTShirtSize(params);
    const prefix = params.routingContext?.plan?.fleet_node_routing_override || envs.LAMBDA_DEFAULT_PREFIX;
    const base = `${prefix}-${tshirtSize}`;
    if (params.routingContext?.plan?.lambda_tenant_isolation) {
        return `${base}${LAMBDA_TENANT_ISOLATION_ROUTING_SUFFIX}`;
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
