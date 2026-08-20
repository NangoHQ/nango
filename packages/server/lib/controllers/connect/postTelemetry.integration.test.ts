import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { seeders } from '@nangohq/shared';

import { getConnectSessionToken, isError, runServer } from '../../utils/tests.js';
import { MAX_CLOCK_SKEW_MS } from './postTelemetry.js';

let api: Awaited<ReturnType<typeof runServer>>;
let connectSessionToken: string;

const endpoint = '/connect/telemetry';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        connectSessionToken = await getConnectSessionToken(api, apiKey.secret);
    });

    beforeEach(() => {
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(() => {
        api.server.close();
    });

    it.each([
        ['a current timestamp', 0],
        ['a timestamp at the maximum allowed clock skew in the past', -MAX_CLOCK_SKEW_MS],
        ['a timestamp at the maximum allowed clock skew in the future', MAX_CLOCK_SKEW_MS]
    ])('accepts telemetry with %s', async (_description, offset) => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            body: {
                token: connectSessionToken,
                event: 'open',
                timestamp: new Date(Date.now() + offset)
            }
        });

        expect(res.res.status).toBe(204);
    });

    it.each([
        ['older than the maximum allowed clock skew', -MAX_CLOCK_SKEW_MS - 60_000],
        ['further ahead than the maximum allowed clock skew', MAX_CLOCK_SKEW_MS + 60_000]
    ])('rejects telemetry with a timestamp %s', async (_description, offset) => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            body: {
                token: connectSessionToken,
                event: 'open',
                timestamp: new Date(Date.now() + offset)
            }
        });

        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'custom', message: `timestamp is more than ${MAX_CLOCK_SKEW_MS}ms away from the current time`, path: ['timestamp'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });
});
