import { afterEach, describe, expect, it, vi } from 'vitest';

import { signupConversionsCron } from './signupConversions.js';

const mocks = vi.hoisted(() => ({
    envs: {
        NANGO_CLOUD: true,
        NODE_ENV: 'production',
        ADVERTISING_CONSENT_ENABLED: true,
        SIGNUP_AD_CONVERSIONS_ENABLED: false,
        SIGNUP_AD_CONVERSIONS_CONFIG: 'never-read-while-disabled'
    },
    schedule: vi.fn(),
    adapters: vi.fn().mockReturnValue([])
}));
vi.mock('../env.js', () => ({ envs: mocks.envs }));
vi.mock('node-cron', () => ({ schedule: mocks.schedule }));
vi.mock('../services/signupConversions/adapters.js', () => ({ createConversionAdapters: mocks.adapters }));
vi.mock('../services/signupConversions/worker.js', () => ({ deliverNextConversion: vi.fn(), enqueueConversions: vi.fn() }));

afterEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.envs, { NANGO_CLOUD: true, NODE_ENV: 'production', ADVERTISING_CONSENT_ENABLED: true, SIGNUP_AD_CONVERSIONS_ENABLED: false });
});

describe('signup conversion startup', () => {
    it('does not load credentials or start work by default', () => {
        signupConversionsCron();
        expect(mocks.adapters).not.toHaveBeenCalled();
        expect(mocks.schedule).not.toHaveBeenCalled();
    });
    it('requires production cloud, consent capture and a separate delivery enable setting', () => {
        mocks.envs.SIGNUP_AD_CONVERSIONS_ENABLED = true;
        mocks.envs.NODE_ENV = 'development';
        signupConversionsCron();
        mocks.envs.NODE_ENV = 'production';
        mocks.envs.NANGO_CLOUD = false;
        signupConversionsCron();
        mocks.envs.NANGO_CLOUD = true;
        mocks.envs.ADVERTISING_CONSENT_ENABLED = false;
        signupConversionsCron();
        expect(mocks.schedule).not.toHaveBeenCalled();
        mocks.envs.ADVERTISING_CONSENT_ENABLED = true;
        signupConversionsCron();
        expect(mocks.schedule).toHaveBeenCalledOnce();
    });
    it('isolates malformed delivery configuration from server startup', () => {
        mocks.envs.SIGNUP_AD_CONVERSIONS_ENABLED = true;
        mocks.adapters.mockImplementationOnce(() => {
            throw new Error('Invalid signup conversion configuration');
        });
        expect(() => signupConversionsCron()).not.toThrow();
        expect(mocks.schedule).not.toHaveBeenCalled();
    });
});
