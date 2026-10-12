import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { productTracking } from '@nangohq/shared';

import { runServer } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/cli/telemetry';
const deviceId = '7f1c2a3e-1d2b-4c5d-8e9f-0a1b2c3d4e5f';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(() => {
        api.server.close();
    });

    it.each([
        ['a command', { command: 'deploy' }],
        ['a legacy event from a released CLI', { event: 'cli:deploy' }]
    ] as const)('tracks %s as functions:command_start', async (_description, payload) => {
        const trackAnonymous = vi.spyOn(productTracking, 'trackAnonymous');

        const res = await api.fetch(endpoint, { method: 'POST', body: { deviceId, ...payload } });

        expect(res.res.status).toBe(204);
        expect(trackAnonymous).toHaveBeenCalledWith({ name: 'functions:command_start', distinctId: deviceId, eventProperties: { command: 'deploy' } });
    });

    it('maps a legacy event whose command name differs', async () => {
        const trackAnonymous = vi.spyOn(productTracking, 'trackAnonymous');

        await api.fetch(endpoint, { method: 'POST', body: { deviceId, event: 'cli:migrate_to_zero_yaml', ephemeral: true } });

        expect(trackAnonymous).toHaveBeenCalledWith({
            name: 'functions:command_start',
            distinctId: deviceId,
            eventProperties: { command: 'migrate-to-zero-yaml', is_device_ephemeral: true }
        });
    });

    it.each([
        ['an unknown command', { command: 'nope' }],
        ['both a command and an event', { command: 'deploy', event: 'cli:deploy' }]
    ])('rejects %s', async (_description, payload) => {
        const res = await api.fetch(endpoint, { method: 'POST', body: { deviceId, ...payload } as never });

        expect(res.res.status).toBe(400);
    });
});
