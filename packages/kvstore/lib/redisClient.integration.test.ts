import { createClient } from 'redis';
import { GenericContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getRedisClientOptions } from './redisClient.js';

import type { StartedTestContainer } from 'testcontainers';

// Backward-compatibility: the static-auth path (no token file) must keep working
// against a password-protected Redis under node-redis v5. The shared integration
// Redis has no password, so this spins up its own `requirepass` instance.
const PASSWORD = 'super-secret-pass';

describe('getRedisClientOptions static auth', () => {
    let container: StartedTestContainer;
    let host: string;
    let port: number;

    beforeAll(async () => {
        container = await new GenericContainer('redis:8.0.4-alpine').withExposedPorts(6379).withCommand(['redis-server', '--requirepass', PASSWORD]).start();
        host = container.getHost();
        port = container.getMappedPort(6379);
    }, 60_000);

    afterAll(async () => {
        await container?.stop();
    });

    it('authenticates with a password-only url (requirepass) and runs commands', async () => {
        const url = `redis://:${PASSWORD}@${host}:${port}`;
        const client = await createClient(getRedisClientOptions(url)).connect();
        try {
            await client.set('k', 'v');
            expect(await client.get('k')).toBe('v');
        } finally {
            await client.disconnect();
        }
    });

    it('is rejected by the server when no password is supplied', async () => {
        const url = `redis://${host}:${port}`;
        // RESP3 sends AUTH inside HELLO during handshake, so a missing password
        // fails at connect time (not on the first command). Disable reconnect so
        // the client rejects immediately instead of retrying until timeout.
        const client = createClient({
            ...getRedisClientOptions(url),
            socket: { reconnectStrategy: () => false }
        });
        await expect(client.connect()).rejects.toThrow(/NOAUTH/i);
    });
});
