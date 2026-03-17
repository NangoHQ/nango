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

import { getRoutingId } from './lambda.js';

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

describe('getRoutingId', () => {
    beforeEach(() => {
        mockEnvs.LAMBDA_DEFAULT_PREFIX = 'default-prefix';
        mockEnvs.LAMBDA_DEFAULT_MEMORY_MB = 512;
    });

    it('uses fleet_node_routing_override when provided in routingContext.plan', () => {
        const routingContext: RoutingContext = {
            plan: { fleet_node_routing_override: 'custom-override' } as RoutingContext['plan']
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
            routingContext: { plan: null }
        });
        expect(result).toBe('default-prefix-S');
    });

    it('uses LAMBDA_DEFAULT_PREFIX when plan.fleet_node_routing_override is null', () => {
        const routingContext: RoutingContext = {
            plan: { fleet_node_routing_override: null } as RoutingContext['plan']
        };
        const result = getRoutingId({
            nangoProps: minimalNangoProps(),
            routingContext
        });
        expect(result).toBe('default-prefix-S');
    });
});
