import { ErrorCode } from '@openfeature/server-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EnvProvider } from './env.js';

import type { Logger } from '@openfeature/server-sdk';

const mockLogger = vi.hoisted(() => ({
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
}));

vi.mock('@nangohq/utils', () => ({
    getLogger: vi.fn(() => mockLogger)
}));

const noopLogger = {} as Logger;

describe('EnvProvider', () => {
    const realEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = {};
    });

    afterEach(() => {
        process.env = realEnv;
    });

    it('serves a boolean from its env var', async () => {
        process.env['NANGO_FEATURE_FLAG_AUDIT_TRAIL'] = 'true';
        const provider = new EnvProvider();
        await expect(provider.resolveBooleanEvaluation('audit-trail', false, {}, noopLogger)).resolves.toEqual({ value: true, reason: 'STATIC' });
    });

    it('returns the default when no var is set', async () => {
        const provider = new EnvProvider();
        await expect(provider.resolveBooleanEvaluation('audit-trail', true, {}, noopLogger)).resolves.toEqual({ value: true, reason: 'DEFAULT' });
    });

    it.each([
        ['true', true],
        ['TRUE', true],
        [' true ', true],
        ['false', false],
        ['False', false]
    ])('reads %s as the boolean %s', async (raw, expected) => {
        process.env['NANGO_FEATURE_FLAG_AUDIT_TRAIL'] = raw;
        const provider = new EnvProvider();
        await expect(provider.resolveBooleanEvaluation('audit-trail', !expected, {}, noopLogger)).resolves.toEqual({ value: expected, reason: 'STATIC' });
    });

    it.each(['1', '0', 'yes', 'no', 'on', 'off', 'maybe', ''])('returns the default and a type mismatch for the boolean %s', async (raw) => {
        process.env['NANGO_FEATURE_FLAG_AUDIT_TRAIL'] = raw;
        const provider = new EnvProvider();
        await expect(provider.resolveBooleanEvaluation('audit-trail', false, {}, noopLogger)).resolves.toEqual({
            value: false,
            reason: 'ERROR',
            errorCode: ErrorCode.TYPE_MISMATCH,
            errorMessage: 'NANGO_FEATURE_FLAG_AUDIT_TRAIL is not a valid boolean'
        });
        expect(mockLogger.warning).toHaveBeenCalledWith('Ignoring feature flag value, it does not match the flag type', {
            flag: 'audit-trail',
            type: 'boolean',
            value: raw
        });
    });

    it('serves strings verbatim', async () => {
        process.env['NANGO_FEATURE_FLAG_UI_VARIANT'] = ' new ui ';
        const provider = new EnvProvider();
        await expect(provider.resolveStringEvaluation('ui-variant', 'old-ui', {}, noopLogger)).resolves.toEqual({ value: ' new ui ', reason: 'STATIC' });
    });

    it('serves numbers', async () => {
        process.env['NANGO_FEATURE_FLAG_RATE_LIMIT'] = ' 42 ';
        const provider = new EnvProvider();
        await expect(provider.resolveNumberEvaluation('rate-limit', 10, {}, noopLogger)).resolves.toEqual({ value: 42, reason: 'STATIC' });
    });

    it.each(['', 'abc', 'Infinity'])('returns the default for the number %s', async (raw) => {
        process.env['NANGO_FEATURE_FLAG_RATE_LIMIT'] = raw;
        const provider = new EnvProvider();
        await expect(provider.resolveNumberEvaluation('rate-limit', 10, {}, noopLogger)).resolves.toMatchObject({ value: 10, reason: 'ERROR' });
    });

    it('serves objects as JSON', async () => {
        process.env['NANGO_FEATURE_FLAG_LIMITS'] = '{"max":3}';
        const provider = new EnvProvider();
        await expect(provider.resolveObjectEvaluation('limits', { max: 1 }, {}, noopLogger)).resolves.toEqual({ value: { max: 3 }, reason: 'STATIC' });
    });

    it('returns the default when the object is not valid JSON', async () => {
        process.env['NANGO_FEATURE_FLAG_LIMITS'] = '{max:3}';
        const provider = new EnvProvider();
        await expect(provider.resolveObjectEvaluation('limits', { max: 1 }, {}, noopLogger)).resolves.toMatchObject({ value: { max: 1 }, reason: 'ERROR' });
    });

    it.each(['null', '[1,2]', '"str"', '42', 'true'])('returns the default when the object default is not shaped like %s', async (raw) => {
        process.env['NANGO_FEATURE_FLAG_LIMITS'] = raw;
        const provider = new EnvProvider();
        await expect(provider.resolveObjectEvaluation('limits', { max: 1 }, {}, noopLogger)).resolves.toEqual({
            value: { max: 1 },
            reason: 'ERROR',
            errorCode: ErrorCode.TYPE_MISMATCH,
            errorMessage: 'NANGO_FEATURE_FLAG_LIMITS is not a valid object'
        });
    });

    it('serves an array when the default is an array', async () => {
        process.env['NANGO_FEATURE_FLAG_LIMITS'] = '[1,2]';
        const provider = new EnvProvider();
        await expect(provider.resolveObjectEvaluation('limits', [0], {}, noopLogger)).resolves.toEqual({ value: [1, 2], reason: 'STATIC' });
    });

    it('rejects an object when the default is an array', async () => {
        process.env['NANGO_FEATURE_FLAG_LIMITS'] = '{"max":3}';
        const provider = new EnvProvider();
        await expect(provider.resolveObjectEvaluation('limits', [0], {}, noopLogger)).resolves.toMatchObject({ value: [0], reason: 'ERROR' });
    });

    it('ignores the evaluation context', async () => {
        process.env['NANGO_FEATURE_FLAG_AUDIT_TRAIL'] = 'true';
        const provider = new EnvProvider();
        await expect(provider.resolveBooleanEvaluation('audit-trail', false, { targetingKey: 'uuid1' }, noopLogger)).resolves.toEqual({
            value: true,
            reason: 'STATIC'
        });
    });

    it('ignores vars that are not flags', async () => {
        process.env['NANGO_FLAG_PROVIDER'] = 'env';
        process.env['AUDIT_TRAIL'] = 'true';
        const provider = new EnvProvider();
        await expect(provider.resolveBooleanEvaluation('audit-trail', false, {}, noopLogger)).resolves.toEqual({ value: false, reason: 'DEFAULT' });
    });

    it('logs the flags it serves', () => {
        process.env['NANGO_FEATURE_FLAG_AUDIT_TRAIL'] = 'true';
        process.env['NANGO_FEATURE_FLAG_MFA'] = 'false';
        new EnvProvider();
        expect(mockLogger.info).toHaveBeenCalledWith('Serving feature flags from env vars: audit-trail, mfa');
    });

    it('warns when it has no flag to serve', () => {
        new EnvProvider();
        expect(mockLogger.warning).toHaveBeenCalledWith('No NANGO_FEATURE_FLAG_* variable is set; every flag will use its default');
    });
});
