import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRaw } = vi.hoisted(() => {
    return {
        mockRaw: vi.fn()
    };
});

vi.mock('@nangohq/database', () => ({
    default: {
        knex: {
            raw: mockRaw
        }
    }
}));

import { listIntegrationFunctions } from './function.service.js';

describe('function.service listIntegrationFunctions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRaw.mockResolvedValue({ rows: [] });
    });

    it('uses a deterministic sort order for paginated listings', async () => {
        await listIntegrationFunctions({
            environmentId: 1,
            providerConfigKey: 'github',
            type: 'on-event',
            limit: 10,
            offset: 20
        });

        expect(mockRaw).toHaveBeenCalledTimes(1);

        const [query, bindings] = mockRaw.mock.calls[0]!;

        expect(query).toContain('ORDER BY type ASC, name ASC, event ASC, id ASC');
        expect(bindings).toStrictEqual([1, 'github', 'on-event', 'on-event', 1, 'github', 'on-event', 'on-event', 10, 20]);
    });
});
