import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildFlags } from './flags.js';

import type { FeatureFlagsClient } from './client.js';

const state = vi.hoisted(() => ({ isCloud: false }));

vi.mock('@nangohq/utils', () => ({
    get isCloud() {
        return state.isCloud;
    }
}));

function makeClient(value: boolean) {
    const isEnabled = vi.fn().mockResolvedValue(value);
    const client: FeatureFlagsClient = { isEnabled, getString: vi.fn(), getNumber: vi.fn(), getObject: vi.fn(), destroy: vi.fn() };
    return { client, isEnabled };
}

const accountUuid = 'account-uuid';

describe.each([
    { method: 'isConnectionsSearchParamEnabled', key: 'connections-search-param' },
    { method: 'isV1PassthroughEnabled', key: 'v1-passthrough' }
] as const)('$method', ({ method, key }) => {
    beforeEach(() => {
        state.isCloud = false;
    });

    it('evaluates the flag on cloud, defaulting to false', async () => {
        state.isCloud = true;
        const { client, isEnabled } = makeClient(false);

        await expect(buildFlags(client)[method](accountUuid)).resolves.toBe(false);
        expect(isEnabled).toHaveBeenCalledWith(key, { targetingKey: accountUuid, accountUuid }, false);
    });

    it('returns the allowlisted value on cloud', async () => {
        state.isCloud = true;

        await expect(buildFlags(makeClient(true).client)[method](accountUuid)).resolves.toBe(true);
    });

    it('is always enabled off cloud without evaluating the flag', async () => {
        const { client, isEnabled } = makeClient(false);

        await expect(buildFlags(client)[method](accountUuid)).resolves.toBe(true);
        expect(isEnabled).not.toHaveBeenCalled();
    });
});
