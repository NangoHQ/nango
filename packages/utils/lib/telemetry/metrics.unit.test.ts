import { afterEach, describe, expect, it, vi } from 'vitest';

const dogstatsd = vi.hoisted(() => ({
    increment: vi.fn(),
    decrement: vi.fn(),
    gauge: vi.fn(),
    histogram: vi.fn(),
    distribution: vi.fn()
}));

vi.mock('dd-trace', () => ({
    default: {
        dogstatsd
    }
}));

describe('applyDimensionPolicy', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
        vi.clearAllMocks();
    });

    async function loadMetrics() {
        return await import('./metrics.js');
    }

    it('strips providerConfigKey from a gated metric when the flag is off', async () => {
        vi.stubEnv('NANGO_METRICS_INCLUDE_PROVIDER_CONFIG_KEY', 'false');
        vi.resetModules();
        const { applyDimensionPolicy, Types } = await loadMetrics();
        expect(applyDimensionPolicy(Types.AUTH_SUCCESS, { provider: 'github', providerConfigKey: 'github-prod' })).toEqual({ provider: 'github' });
    });

    it('keeps providerConfigKey on a gated metric when the flag is on', async () => {
        vi.stubEnv('NANGO_METRICS_INCLUDE_PROVIDER_CONFIG_KEY', 'true');
        vi.resetModules();
        const { applyDimensionPolicy, Types } = await loadMetrics();
        const dimensions = { provider: 'github', providerConfigKey: 'github-prod' };
        expect(applyDimensionPolicy(Types.AUTH_SUCCESS, dimensions)).toBe(dimensions);
    });

    it('keeps providerConfigKey on DEPLOY_SECURITY_SCAN when the flag is off', async () => {
        vi.stubEnv('NANGO_METRICS_INCLUDE_PROVIDER_CONFIG_KEY', 'false');
        vi.resetModules();
        const { applyDimensionPolicy, Types } = await loadMetrics();
        const dimensions = { providerConfigKey: 'github-prod', result: 'pass' };
        expect(applyDimensionPolicy(Types.DEPLOY_SECURITY_SCAN, dimensions)).toBe(dimensions);
    });

    it('passes through an unlisted metric that includes providerConfigKey regardless of flag state', async () => {
        const dimensions = { providerConfigKey: 'github-prod', queue: 'sync' };

        vi.stubEnv('NANGO_METRICS_INCLUDE_PROVIDER_CONFIG_KEY', 'false');
        vi.resetModules();
        const off = await loadMetrics();
        expect(off.applyDimensionPolicy(off.Types.TASKS_QUEUE_DEPTH, dimensions)).toBe(dimensions);

        vi.stubEnv('NANGO_METRICS_INCLUDE_PROVIDER_CONFIG_KEY', 'true');
        vi.resetModules();
        const on = await loadMetrics();
        expect(on.applyDimensionPolicy(on.Types.TASKS_QUEUE_DEPTH, dimensions)).toBe(dimensions);
    });

    it('returns undefined when dimensions are undefined', async () => {
        vi.resetModules();
        const { applyDimensionPolicy, Types } = await loadMetrics();
        expect(applyDimensionPolicy(Types.AUTH_SUCCESS, undefined)).toBeUndefined();
    });

    it('forwards stripped dimensions from increment when the flag is off', async () => {
        vi.stubEnv('NANGO_METRICS_INCLUDE_PROVIDER_CONFIG_KEY', 'false');
        vi.resetModules();
        const { increment, Types } = await loadMetrics();
        increment(Types.AUTH_SUCCESS, 1, { provider: 'github', providerConfigKey: 'github-prod' });
        expect(dogstatsd.increment).toHaveBeenCalledWith(Types.AUTH_SUCCESS, 1, { provider: 'github' });
    });

    it('forwards providerConfigKey from increment when the flag is on', async () => {
        vi.stubEnv('NANGO_METRICS_INCLUDE_PROVIDER_CONFIG_KEY', 'true');
        vi.resetModules();
        const { increment, Types } = await loadMetrics();
        increment(Types.AUTH_SUCCESS, 1, { provider: 'github', providerConfigKey: 'github-prod' });
        expect(dogstatsd.increment).toHaveBeenCalledWith(Types.AUTH_SUCCESS, 1, { provider: 'github', providerConfigKey: 'github-prod' });
    });

    it('does not strip providerConfigKey from DEPLOY_SECURITY_SCAN via increment when the flag is off', async () => {
        vi.stubEnv('NANGO_METRICS_INCLUDE_PROVIDER_CONFIG_KEY', 'false');
        vi.resetModules();
        const { increment, Types } = await loadMetrics();
        increment(Types.DEPLOY_SECURITY_SCAN, 1, { providerConfigKey: 'github-prod', result: 'pass' });
        expect(dogstatsd.increment).toHaveBeenCalledWith(Types.DEPLOY_SECURITY_SCAN, 1, { providerConfigKey: 'github-prod', result: 'pass' });
    });
});
