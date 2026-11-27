import { describe, expect, it, vi } from 'vitest';

import { resolveEmailProvider } from './client.js';

vi.mock('./env.js', () => ({ envs: {} }));

const unset = { EMAIL_PROVIDER: undefined, MAILGUN_API_KEY: undefined, SMTP_URL: undefined, EMAIL_HTTP_URL: undefined };

describe('resolveEmailProvider', () => {
    const testCases = [
        {
            name: 'uses EMAIL_PROVIDER when set, even if other providers are configured',
            envs: { ...unset, EMAIL_PROVIDER: 'ses', MAILGUN_API_KEY: 'key', SMTP_URL: 'smtp://localhost' },
            expected: { provider: 'ses', ignored: [] }
        },
        {
            name: 'honours EMAIL_PROVIDER=none',
            envs: { ...unset, EMAIL_PROVIDER: 'none', SMTP_URL: 'smtp://localhost' },
            expected: { provider: 'none', ignored: [] }
        },
        {
            name: 'infers mailgun when only MAILGUN_API_KEY is set',
            envs: { ...unset, MAILGUN_API_KEY: 'key' },
            expected: { provider: 'mailgun', ignored: [] }
        },
        {
            name: 'infers smtp when only SMTP_URL is set',
            envs: { ...unset, SMTP_URL: 'smtp://localhost' },
            expected: { provider: 'smtp', ignored: [] }
        },
        {
            name: 'infers http when only EMAIL_HTTP_URL is set',
            envs: { ...unset, EMAIL_HTTP_URL: 'https://api.example.com' },
            expected: { provider: 'http', ignored: [] }
        },
        {
            name: 'keeps the legacy precedence and reports the providers it ignores',
            envs: { ...unset, MAILGUN_API_KEY: 'key', SMTP_URL: 'smtp://localhost', EMAIL_HTTP_URL: 'https://api.example.com' },
            expected: { provider: 'mailgun', ignored: ['smtp', 'http'] }
        },
        {
            name: 'falls back to none when nothing is configured',
            envs: unset,
            expected: { provider: 'none', ignored: [] }
        }
    ] as const;

    for (const testCase of testCases) {
        it(testCase.name, () => {
            expect(resolveEmailProvider(testCase.envs)).toStrictEqual(testCase.expected);
        });
    }
});
