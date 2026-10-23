import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { deliverXSignup, seeders } from '@nangohq/shared';

import { envs } from '../../env.js';
import { runServer } from '../../utils/tests.js';

vi.mock('@nangohq/shared', async (importOriginal) => ({ ...(await importOriginal<typeof import('@nangohq/shared')>()), deliverXSignup: vi.fn() }));
const config = {
    SIGNUP_X_DELIVERY_ENABLED: true,
    SIGNUP_X_ROUTE_SECRET: 'fake_route_secret_for_test_only_12345',
    SIGNUP_X_DELIVERY_START_AT: '2026-10-23T00:00:00Z',
    SIGNUP_X_PIXEL_ID: 'rh471',
    SIGNUP_X_EVENT_ID: 'abc123',
    SIGNUP_X_CONSUMER_KEY: 'fake',
    SIGNUP_X_CONSUMER_SECRET: 'fake',
    SIGNUP_X_ACCESS_TOKEN: 'fake',
    SIGNUP_X_ACCESS_TOKEN_SECRET: 'fake'
};
const previous = Object.fromEntries(Object.keys(config).map((key) => [key, envs[key as keyof typeof config]]));
let api: Awaited<ReturnType<typeof runServer>>;
const send = (body: unknown, authorization = `Bearer ${config.SIGNUP_X_ROUTE_SECRET}`) =>
    fetch(`${api.url}/internal/analytics/x-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authorization },
        body: typeof body === 'string' ? body : JSON.stringify(body)
    });
async function fixture() {
    const { account, user } = await seeders.seedAccountEnvAndUser();
    const now = new Date().toISOString();
    return {
        account,
        user,
        body: {
            event: 'auth:account_create',
            timestamp: now,
            companyId: String(account.id),
            distinctId: `account-${account.id}`,
            surface: 'server',
            host: 'https://api.nango.dev',
            isSignupCreatorInternal: false,
            consentMethod: 'explicit',
            consentTimestamp: now,
            clickId: 'testclick',
            clickTimestamp: now
        }
    };
}

describe('mounted X signup adapter with database and Redis', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        Object.assign(envs, previous);
        api.server.close();
    });
    beforeEach(() => {
        Object.assign(envs, config);
        vi.mocked(deliverXSignup).mockReset().mockResolvedValue({ outcome: 'accepted', reason: 'receipt' });
    });
    it('defaults disabled and does not require broad internal auth or perform an outbound call', async () => {
        envs.SIGNUP_X_DELIVERY_ENABLED = false;
        const response = await send('{PRIVATE_SENTINEL', '');
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain('PRIVATE_SENTINEL');
        expect(deliverXSignup).not.toHaveBeenCalled();
    });
    it('accepts dedicated route auth and real new-account identity, with no broad internal credential', async () => {
        const { body } = await fixture();
        const response = await send(body);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ outcome: 'accepted', reason: 'receipt' });
        expect(deliverXSignup).toHaveBeenCalledTimes(1);
        expect(deliverXSignup).toHaveBeenCalledWith(body, expect.objectContaining({ pixelId: 'rh471', eventId: 'abc123' }));
    });
    it('checks database internal classification instead of trusting a false event assertion alone', async () => {
        const { body, user } = await fixture();
        await db.knex('_nango_users').where({ id: user.id }).update({ email: 'internal@NANGO.DEV' });
        expect((await send(body)).status).toBe(400);
        expect(deliverXSignup).not.toHaveBeenCalled();
    });
    it('corroborates creation time and retries absent accounts safely', async () => {
        const { body, account } = await fixture();
        await db
            .knex('_nango_accounts')
            .where({ id: account.id })
            .update({ created_at: new Date(Date.now() - 600_000) });
        expect((await send(body)).status).toBe(400);
        expect((await send({ ...body, companyId: '999999999', distinctId: 'account-999999999' })).status).toBe(503);
        expect(deliverXSignup).not.toHaveBeenCalled();
    });
    it('keeps malformed/oversized bodies out of generic JSON error responses', async () => {
        for (const body of ['{PRIVATE_SENTINEL', JSON.stringify({ private: 'PRIVATE_SENTINEL'.repeat(1000) })]) {
            const response = await send(body);
            expect(response.status).toBe(400);
            expect(await response.text()).not.toContain('PRIVATE_SENTINEL');
        }
        expect(deliverXSignup).not.toHaveBeenCalled();
    });
    it('enforces dedicated Redis limits even before authentication', async () => {
        let throttled = false;
        for (let i = 0; i < 121; i++) {
            const response = await send('{}', '');
            if (response.status === 429) throttled = true;
            await response.arrayBuffer();
        }
        expect(throttled).toBe(true);
        expect(deliverXSignup).not.toHaveBeenCalled();
    });
});
