import { describe, expect, it } from 'vitest';

import { environmentIdFromGroupKey } from './concurrency-sampler.js';

describe('environmentIdFromGroupKey', () => {
    it.each([
        ['sync:environment:7', 7],
        ['action:environment:7', 7],
        ['function:scheduled:environment:7', 7],
        ['function:environment:7:connection:3:function:abc', 7]
    ])('reads the environment from %s', (groupKey, environmentId) => {
        expect(environmentIdFromGroupKey(groupKey)).toBe(environmentId);
    });

    it.each(['deleteRecords:5', 'no-environment', 'custom-environment:12', 'sync:environment:12abc', 'sync:environment:', 'sync:environment'])(
        'returns null for %s',
        (groupKey) => {
            expect(environmentIdFromGroupKey(groupKey)).toBeNull();
        }
    );
});
