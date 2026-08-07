import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Elasticsearch retention policies', () => {
    const originalRetentionPeriod = process.env['NANGO_LOGS_ES_RETENTION_PERIOD'];

    afterEach(() => {
        if (originalRetentionPeriod === undefined) {
            delete process.env['NANGO_LOGS_ES_RETENTION_PERIOD'];
        } else {
            process.env['NANGO_LOGS_ES_RETENTION_PERIOD'] = originalRetentionPeriod;
        }
        vi.resetModules();
    });

    it('defaults delete min_age to 15d', async () => {
        delete process.env['NANGO_LOGS_ES_RETENTION_PERIOD'];
        vi.resetModules();

        const { policyMessages, policyOperations } = await import('./schema.js');

        expect(policyOperations.policy?.phases.delete?.min_age).toBe('15d');
        expect(policyMessages.policy?.phases.delete?.min_age).toBe('15d');
    });

    it('uses NANGO_LOGS_ES_RETENTION_PERIOD for delete min_age', async () => {
        process.env['NANGO_LOGS_ES_RETENTION_PERIOD'] = '3d';
        vi.resetModules();

        const { policyMessages, policyOperations } = await import('./schema.js');

        expect(policyOperations.policy?.phases.delete?.min_age).toBe('3d');
        expect(policyMessages.policy?.phases.delete?.min_age).toBe('3d');
    });
});
