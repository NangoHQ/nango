import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnvs = vi.hoisted(() => ({
    LAMBDA_DEFAULT_PREFIX: 'default-prefix',
    LAMBDA_DEFAULT_MEMORY_MB: 512
}));

vi.mock('../env.js', () => ({
    get envs() {
        return mockEnvs;
    }
}));

import { LAMBDA_TENANT_ISOLATION_ROUTING_SUFFIX, getLambdaFunctionName, getLambdaTenantId, getRoutingId, isLambdaTenantIsolationRoutingId } from './lambda.js';

import type { Node } from '@nangohq/fleet';
import type { NangoProps, RoutingContext } from '@nangohq/types';

function minimalNangoProps(): NangoProps {
    return {
        logger: { level: 'info' as const },
        scriptType: 'sync' as const,
        connectionId: 'conn-1',
        nangoConnectionId: 1,
        environmentId: 1,
        environmentName: 'dev',
        providerConfigKey: 'google',
        provider: 'google',
        team: { id: 1, name: 'team' },
        syncId: 'sync-1',
        syncConfig: {} as NangoProps['syncConfig']
    } as unknown as NangoProps;
}

function minimalNode(partial: Pick<Node, 'routingId' | 'id'>): Node {
    return {
        id: partial.id,
        routingId: partial.routingId,
        fleetId: 'f',
        deploymentId: 1,
        url: null,
        state: 'PENDING',
        image: 'img',
        cpuMilli: 500,
        memoryMb: 512,
        storageMb: 512,
        isTracingEnabled: false,
        isProfilingEnabled: false,
        idleMaxDurationMs: null,
        executionTimeoutSecs: null,
        provisionedConcurrency: null,
        replicas: 1,
        error: null,
        createdAt: new Date(),
        lastStateTransitionAt: new Date()
    };
}

describe('getRoutingId', () => {
    beforeEach(() => {
        mockEnvs.LAMBDA_DEFAULT_PREFIX = 'default-prefix';
        mockEnvs.LAMBDA_DEFAULT_MEMORY_MB = 512;
    });

    it('uses fleet_node_routing_override when provided in routingContext.plan', () => {
        const routingContext: RoutingContext = {
            plan: { fleet_node_routing_override: 'custom-override' } as RoutingContext['plan'],
            features: []
        };
        const result = getRoutingId({
            nangoProps: minimalNangoProps(),
            routingContext
        });
        expect(result).toBe('custom-override-S');
    });

    it('uses LAMBDA_DEFAULT_PREFIX when routingContext is undefined', () => {
        const result = getRoutingId({ nangoProps: minimalNangoProps() });
        expect(result).toBe('default-prefix-S');
    });

    it('uses LAMBDA_DEFAULT_PREFIX when routingContext.plan is null', () => {
        const result = getRoutingId({
            nangoProps: minimalNangoProps(),
            routingContext: { plan: null, features: [] }
        });
        expect(result).toBe('default-prefix-S');
    });

    it('uses LAMBDA_DEFAULT_PREFIX when plan.fleet_node_routing_override is null', () => {
        const routingContext: RoutingContext = {
            plan: { fleet_node_routing_override: null } as RoutingContext['plan'],
            features: []
        };
        const result = getRoutingId({
            nangoProps: minimalNangoProps(),
            routingContext
        });
        expect(result).toBe('default-prefix-S');
    });

    it(`appends ${LAMBDA_TENANT_ISOLATION_ROUTING_SUFFIX} when plan.tenant_isolation is true`, () => {
        const routingContext: RoutingContext = {
            plan: { fleet_node_routing_override: null, lambda_tenant_isolation: true } as unknown as RoutingContext['plan'],
            features: []
        };
        const result = getRoutingId({
            nangoProps: minimalNangoProps(),
            routingContext
        });
        expect(result).toBe(`default-prefix-S${LAMBDA_TENANT_ISOLATION_ROUTING_SUFFIX}`);
    });

    it('combines fleet_node_routing_override with tenant_isolation', () => {
        const routingContext: RoutingContext = {
            plan: { fleet_node_routing_override: 'custom', lambda_tenant_isolation: true } as unknown as RoutingContext['plan'],
            features: []
        };
        const result = getRoutingId({
            nangoProps: minimalNangoProps(),
            routingContext
        });
        expect(result).toBe(`custom-S${LAMBDA_TENANT_ISOLATION_ROUTING_SUFFIX}`);
    });
});

describe('isLambdaTenantIsolationRoutingId', () => {
    it('detects tenant-isolation fleet pool routing ids', () => {
        expect(isLambdaTenantIsolationRoutingId(`prefix-M${LAMBDA_TENANT_ISOLATION_ROUTING_SUFFIX}`)).toBe(true);
    });

    it('is false for shared pool routing ids', () => {
        expect(isLambdaTenantIsolationRoutingId('prefix-M')).toBe(false);
    });
});

describe('getLambdaFunctionName', () => {
    it('uses routingId-id for shared pool', () => {
        expect(getLambdaFunctionName(minimalNode({ routingId: 'default-M', id: 42 }))).toBe('default-M-42');
    });

    it('uses base-id-isolated for tenant-isolation pool (distinct AWS name from shared)', () => {
        expect(getLambdaFunctionName(minimalNode({ routingId: 'default-M-isolated', id: 7 }))).toBe('default-M-7-isolated');
    });
});

describe('getLambdaTenantId', () => {
    it('returns team and environment scoped id', () => {
        expect(getLambdaTenantId(minimalNangoProps())).toBe('account-1-env-1');
    });
});
