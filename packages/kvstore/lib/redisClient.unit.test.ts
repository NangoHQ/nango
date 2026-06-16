import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mutable mock env, shared by reference with the module under test.
const mockEnvs = {
    NANGO_REDIS_URL: undefined as string | undefined,
    NANGO_REDIS_HOST: undefined as string | undefined,
    NANGO_REDIS_PORT: undefined as number | undefined,
    NANGO_REDIS_AUTH: undefined as string | undefined,
    NANGO_REDIS_USERNAME: undefined as string | undefined,
    NANGO_REDIS_AUTH_TOKEN_FILE: undefined as string | undefined,
    NANGO_CUSTOMER_REDIS_URL: undefined as string | undefined,
    NANGO_CUSTOMER_REDIS_HOST: undefined as string | undefined,
    NANGO_CUSTOMER_REDIS_PORT: undefined as number | undefined,
    NANGO_CUSTOMER_REDIS_AUTH: undefined as string | undefined,
    NANGO_CUSTOMER_REDIS_USERNAME: undefined as string | undefined,
    NANGO_CUSTOMER_REDIS_AUTH_TOKEN_FILE: undefined as string | undefined
};

vi.mock('./env.js', () => ({ envs: mockEnvs }));

const readFileSync = vi.fn();
vi.mock('node:fs', () => ({ readFileSync: (...args: unknown[]) => readFileSync(...args) }));

const { getRedisUrl, getCustomerRedisUrl, getRedisClientOptions } = await import('./redisClient.js');

function resetEnv() {
    for (const key of Object.keys(mockEnvs)) {
        (mockEnvs as Record<string, unknown>)[key] = undefined;
    }
}

describe('getRedisUrl', () => {
    beforeEach(resetEnv);

    it('returns NANGO_REDIS_URL verbatim when set', () => {
        mockEnvs.NANGO_REDIS_URL = 'rediss://example:6379';
        expect(getRedisUrl()).toBe('rediss://example:6379');
    });

    it('builds a url with inline auth from host/port/auth', () => {
        mockEnvs.NANGO_REDIS_HOST = 'host';
        mockEnvs.NANGO_REDIS_PORT = 6380;
        mockEnvs.NANGO_REDIS_AUTH = 'secret';
        expect(getRedisUrl()).toBe('rediss://:secret@host:6380');
    });

    it('omits inline auth when a token file is configured', () => {
        mockEnvs.NANGO_REDIS_HOST = 'host';
        mockEnvs.NANGO_REDIS_AUTH_TOKEN_FILE = '/run/secrets/token';
        expect(getRedisUrl()).toBe('rediss://host:6379');
    });

    it('returns undefined when host is set but neither auth nor token file is', () => {
        mockEnvs.NANGO_REDIS_HOST = 'host';
        expect(getRedisUrl()).toBeUndefined();
    });

    it('returns undefined when nothing is configured', () => {
        expect(getRedisUrl()).toBeUndefined();
    });
});

describe('getCustomerRedisUrl', () => {
    beforeEach(resetEnv);

    it('omits inline auth when a customer token file is configured', () => {
        mockEnvs.NANGO_CUSTOMER_REDIS_HOST = 'chost';
        mockEnvs.NANGO_CUSTOMER_REDIS_AUTH_TOKEN_FILE = '/run/secrets/customer-token';
        expect(getCustomerRedisUrl()).toBe('rediss://chost:6379');
    });
});

describe('getRedisClientOptions', () => {
    beforeEach(() => {
        resetEnv();
        readFileSync.mockReset();
    });

    it('builds a TLS socket and no credentials provider for a rediss url without token file', () => {
        const options = getRedisClientOptions('rediss://host:6379');
        expect(options.socket).toMatchObject({ tls: true, connectTimeout: 10_000, servername: 'host' });
        expect(typeof options.socket.reconnectStrategy).toBe('function');
        expect('credentialsProvider' in options).toBe(false);
    });

    it('uses an empty socket for a non-TLS url', () => {
        const options = getRedisClientOptions('redis://host:6379');
        expect(options.socket).toEqual({});
        expect('credentialsProvider' in options).toBe(false);
    });

    it('attaches an async credentials provider that reads the token file on every call', async () => {
        mockEnvs.NANGO_REDIS_AUTH_TOKEN_FILE = '/run/secrets/token';
        readFileSync.mockReturnValueOnce('token-1\n').mockReturnValueOnce('token-2\n');

        const options = getRedisClientOptions('rediss://host:6379');
        const provider = (options as { credentialsProvider?: { type: string; credentials: () => Promise<{ username?: string; password?: string }> } })
            .credentialsProvider;

        expect(provider?.type).toBe('async-credentials-provider');
        // Re-read on each (re)connect so a rotated token is always picked up.
        await expect(provider!.credentials()).resolves.toEqual({ password: 'token-1' });
        await expect(provider!.credentials()).resolves.toEqual({ password: 'token-2' });
        expect(readFileSync).toHaveBeenCalledTimes(2);
    });

    it('includes the username when configured', async () => {
        mockEnvs.NANGO_REDIS_AUTH_TOKEN_FILE = '/run/secrets/token';
        mockEnvs.NANGO_REDIS_USERNAME = 'iam-principal';
        readFileSync.mockReturnValue('the-token');

        const options = getRedisClientOptions('rediss://host:6379');
        const provider = (options as { credentialsProvider?: { credentials: () => Promise<{ username?: string; password?: string }> } }).credentialsProvider;

        await expect(provider!.credentials()).resolves.toEqual({ username: 'iam-principal', password: 'the-token' });
    });

    it('uses the customer token file for the customer boundary', async () => {
        mockEnvs.NANGO_CUSTOMER_REDIS_AUTH_TOKEN_FILE = '/run/secrets/customer-token';
        readFileSync.mockReturnValue('customer-token');

        const options = getRedisClientOptions('rediss://chost:6379', 'customer');
        const provider = (options as { credentialsProvider?: { credentials: () => Promise<{ password?: string }> } }).credentialsProvider;

        await expect(provider!.credentials()).resolves.toEqual({ password: 'customer-token' });
        expect(readFileSync).toHaveBeenCalledWith('/run/secrets/customer-token', 'utf8');
    });
});
