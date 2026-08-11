import { afterEach, describe, expect, it, vi } from 'vitest';

describe('OpenSearch ISM retention policies', () => {
    const originalRetentionPeriod = process.env['NANGO_LOGS_ES_RETENTION_PERIOD'];

    afterEach(() => {
        if (originalRetentionPeriod === undefined) {
            delete process.env['NANGO_LOGS_ES_RETENTION_PERIOD'];
        } else {
            process.env['NANGO_LOGS_ES_RETENTION_PERIOD'] = originalRetentionPeriod;
        }
        vi.resetModules();
    });

    it('uses NANGO_LOGS_ES_RETENTION_PERIOD for min_index_age', async () => {
        process.env['NANGO_LOGS_ES_RETENTION_PERIOD'] = '3d';
        vi.resetModules();

        const { putIsmPolicies } = await import('./ismPolicies.js');
        const request = vi.fn();

        await putIsmPolicies({ transport: { request } } as never);

        expect(request).toHaveBeenCalledTimes(2);
        for (const call of request.mock.calls) {
            const [{ body }] = call as [{ body: { policy: { description: string; states: [{ transitions: [{ conditions: { min_index_age: string } }] }] } } }];
            expect(body.policy.description).toContain('3d');
            expect(body.policy.states[0].transitions[0].conditions.min_index_age).toBe('3d');
        }
    });
});
