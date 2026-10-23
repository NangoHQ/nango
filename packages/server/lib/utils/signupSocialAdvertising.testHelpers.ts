import { envs } from '../env.js';

/** Isolated integration fixture; always restore flags after each flow. */
export function socialSignupFixture(now = Date.now(), environment = envs) {
    const config = {
        SIGNUP_X_CONTEXT_ENABLED: true,
        SIGNUP_X_CONTEXT_COOKIE_NAME: 'x_test',
        SIGNUP_REDDIT_CONTEXT_ENABLED: true,
        SIGNUP_REDDIT_CONTEXT_COOKIE_NAME: 'reddit_test'
    };
    const previous = Object.fromEntries(Object.keys(config).map((key) => [key, environment[key as keyof typeof config]]));
    Object.assign(environment, config);
    const context = {
        version: 1,
        marketing: true,
        gpc: false,
        method: 'explicit',
        gdpr: true,
        lgpd: false,
        ccpa: false,
        observedAt: now,
        clickId: 'synthetic_social',
        clickAt: now - 1000
    };
    const value = encodeURIComponent(JSON.stringify(context));
    return {
        cookie: `x_test=${value}; reddit_test=${value}`,
        expected: { advertising_x_click_id: 'synthetic_social', advertising_reddit_click_id: 'synthetic_social', is_signup_creator_internal: false },
        restore: () => Object.assign(environment, previous)
    };
}
