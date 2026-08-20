import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { clearInternalServiceCredentialCache, getInternalAuthBearerHeader, getInternalServiceCredential, isInternalAuthRequired } from './credential.js';

const dir = mkdtempSync(join(tmpdir(), 'nango-internal-auth-'));

afterEach(() => {
    clearInternalServiceCredentialCache();
    vi.useRealTimers();
});

afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});

function jwtWithExp(exp: number): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
    return `${header}.${payload}.sig`;
}

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

    it('caches a non-JWT file credential until the refresh TTL', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const path = join(dir, 'cached-static');
        writeFileSync(path, 'first');
        const env = { NANGO_INTERNAL_AUTH_TOKEN_FILE: path };

        expect(getInternalServiceCredential(env)).toBe('first');
        writeFileSync(path, 'second');
        expect(getInternalServiceCredential(env)).toBe('first');

        vi.advanceTimersByTime(30_000);
        expect(getInternalServiceCredential(env)).toBe('second');
    });

    it('re-reads a JWT file credential near expiry', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const nowMs = Date.now();
        const path = join(dir, 'cached-jwt');
        writeFileSync(path, jwtWithExp(Math.floor(nowMs / 1000) + 100));
        const env = { NANGO_INTERNAL_AUTH_TOKEN_FILE: path };

        expect(getInternalServiceCredential(env)).toBe(jwtWithExp(Math.floor(nowMs / 1000) + 100));
        const rotated = jwtWithExp(Math.floor(nowMs / 1000) + 1100);
        writeFileSync(path, rotated);

        vi.advanceTimersByTime(39_000);
        expect(getInternalServiceCredential(env)).not.toBe(rotated);

        vi.advanceTimersByTime(1_000);
        expect(getInternalServiceCredential(env)).toBe(rotated);
    });

    it('keeps the cached token if a later read fails', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const path = join(dir, 'cached-then-gone');
        writeFileSync(path, 'still-valid');
        const env = { NANGO_INTERNAL_AUTH_TOKEN_FILE: path };
        expect(getInternalServiceCredential(env)).toBe('still-valid');
        rmSync(path);
        vi.advanceTimersByTime(30_000);
        expect(getInternalServiceCredential(env)).toBe('still-valid');
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
