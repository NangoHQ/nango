import { describe, expect, it, vi } from 'vitest';

import { buildFeatureFlagsClient } from './client.js';
import { buildFlags } from './flags.js';
import { NoopProvider } from './providers/noop.js';

import type { FeatureFlagsClient } from './client.js';

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
    it('is enabled when no provider has a value, so self-hosted keeps the deprecated feature', async () => {
        const flags = buildFlags(buildFeatureFlagsClient(new NoopProvider()));

        await expect(flags[method](accountUuid)).resolves.toBe(true);
    });

    it("returns the provider's value, so Unleash can restrict it to an allowlist", async () => {
        const { client, isEnabled } = makeClient(false);

        await expect(buildFlags(client)[method](accountUuid)).resolves.toBe(false);
        expect(isEnabled).toHaveBeenCalledWith(key, { targetingKey: accountUuid, accountUuid }, true);
    });
});
