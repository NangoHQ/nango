import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { getInternalAuthBearerHeader, getInternalServiceCredential, isInternalAuthRequired } from './credential.js';

const dir = mkdtempSync(join(tmpdir(), 'nango-internal-auth-'));

afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('getInternalServiceCredential', () => {
    it('returns null when nothing is set', () => {
        expect(getInternalServiceCredential({})).toBeNull();
    });

    it('reads NANGO_INTERNAL_AUTH_TOKEN', () => {
        expect(getInternalServiceCredential({ NANGO_INTERNAL_AUTH_TOKEN: ' secret ' })).toBe('secret');
    });

    it('prefers a readable token file', () => {
        const path = join(dir, 'token');
        writeFileSync(path, 'from-file\n');
        expect(
            getInternalServiceCredential({
                NANGO_INTERNAL_AUTH_TOKEN_FILE: path,
                NANGO_INTERNAL_AUTH_TOKEN: 'env-token'
            })
        ).toBe('from-file');
    });

    it('falls back to the env token when the file is missing', () => {
        expect(
            getInternalServiceCredential({
                NANGO_INTERNAL_AUTH_TOKEN_FILE: join(dir, 'does-not-exist'),
                NANGO_INTERNAL_AUTH_TOKEN: 'env-token'
            })
        ).toBe('env-token');
    });

    it('returns null when the file is missing and no env token is set', () => {
        expect(getInternalServiceCredential({ NANGO_INTERNAL_AUTH_TOKEN_FILE: join(dir, 'does-not-exist') })).toBeNull();
    });
});

describe('isInternalAuthRequired', () => {
    it('defaults to false', () => {
        expect(isInternalAuthRequired({})).toBe(false);
        expect(isInternalAuthRequired({ NANGO_INTERNAL_AUTH_REQUIRED: 'false' })).toBe(false);
    });

    it('is true only for the string true', () => {
        expect(isInternalAuthRequired({ NANGO_INTERNAL_AUTH_REQUIRED: 'true' })).toBe(true);
        expect(isInternalAuthRequired({ NANGO_INTERNAL_AUTH_REQUIRED: 'TRUE' })).toBe(true);
    });
});

describe('getInternalAuthBearerHeader', () => {
    it('omits the header when there is no token', () => {
        expect(getInternalAuthBearerHeader(null)).toEqual({});
        expect(getInternalAuthBearerHeader(undefined)).toEqual({});
        expect(getInternalAuthBearerHeader('')).toEqual({});
    });

    it('sets Authorization when a token is present', () => {
        expect(getInternalAuthBearerHeader('abc')).toEqual({ Authorization: 'Bearer abc' });
    });
});
