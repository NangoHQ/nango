import { describe, expect, it } from 'vitest';

import { flowConfig } from './validation.js';

const base = {
    type: 'sync' as const,
    models: ['Contact'],
    runs: null,
    syncName: 'my-flow',
    providerConfigKey: 'github',
    fileBody: { js: 'compiled', ts: 'source' }
};

describe('flowConfig function validation', () => {
    it('accepts a non-function flow without function_config', () => {
        expect(flowConfig.safeParse(base).success).toBe(true);
    });

    it('requires function_config for function deploys', () => {
        const result = flowConfig.safeParse({ ...base, type: 'function' });
        expect(result.success).toBe(false);
    });

    it('rejects function_config on non-function deploys', () => {
        const result = flowConfig.safeParse({ ...base, function_config: { trigger: { kind: 'http' } } });
        expect(result.success).toBe(false);
    });

    it('accepts a function with an http trigger', () => {
        const result = flowConfig.safeParse({ ...base, type: 'function', function_config: { trigger: { kind: 'http' } } });
        expect(result.success).toBe(true);
    });

    it('requires a schedule on schedule triggers', () => {
        const missing = flowConfig.safeParse({ ...base, type: 'function', function_config: { trigger: { kind: 'schedule' } } });
        expect(missing.success).toBe(false);

        const present = flowConfig.safeParse({ ...base, type: 'function', function_config: { trigger: { kind: 'schedule', schedule: 'every hour' } } });
        expect(present.success).toBe(true);
    });

    it('requires an event on event triggers', () => {
        const missing = flowConfig.safeParse({ ...base, type: 'function', function_config: { trigger: { kind: 'event' } } });
        expect(missing.success).toBe(false);

        const present = flowConfig.safeParse({ ...base, type: 'function', function_config: { trigger: { kind: 'event', event: 'post-connection-creation' } } });
        expect(present.success).toBe(true);
    });
});
