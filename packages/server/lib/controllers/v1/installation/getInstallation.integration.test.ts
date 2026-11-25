import { generateKeyPairSync, sign } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { signLicense } from '@nangohq/license';
import { seeders, userService } from '@nangohq/shared';
import { flags, NANGO_VERSION } from '@nangohq/utils';

import { authenticateUser, isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

import type * as envModule from '../../../env.js';
import type * as licenseModule from '@nangohq/license';
import type { License } from '@nangohq/types';

const state = vi.hoisted(() => ({
    publicKeyPem: null as string | null,
    envelope: undefined as string | undefined
}));

vi.mock('@nangohq/license', async (importOriginal) => ({
    ...(await importOriginal<typeof licenseModule>()),
    get licensePublicKey() {
        return state.publicKeyPem;
    }
}));
vi.mock('../../../env.js', async (importOriginal) => {
    const mod = await importOriginal<typeof envModule>();
    return {
        ...mod,
        envs: {
            ...mod.envs,
            get NANGO_LICENSE() {
                return state.envelope;
            }
        }
    };
});

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const key = {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    sign: (data: Buffer) => Promise.resolve(sign('sha256', data, privateKey))
};
const license: License = {
    version: 1,
    installation_id: 'f4a2c0e1-7b3d-4e2a-9c1f-0a6d5e8b2c44',
    name: 'acme/prod',
    issued_at: '2026-01-01T00:00:00Z',
    expires_at: '2999-01-01T00:00:00Z',
    grace_until: '2999-04-01T00:00:00Z',
    telemetry: true
};

const route = '/api/v1/installation';
let api: Awaited<ReturnType<typeof runServer>>;
let envelope: string;

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        flags.hasAuthRoles = true;
        api = await runServer();
        ({ envelope } = await signLicense(license, key));
    });

    afterAll(() => {
        flags.hasAuthRoles = false;
        api.server.close();
    });

    beforeEach(() => {
        state.publicKeyPem = key.publicKeyPem;
        state.envelope = envelope;
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET' });
        shouldBeProtected(res);
    });

    it('rejects a role without the account scope', async () => {
        const { user } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true } });
        await userService.update({ id: user.id, role: 'development_full_access' });
        const session = await authenticateUser(api, user);
        const res = await api.fetch(route, { method: 'GET', session });
        expect(res.res.status).toBe(403);
    });

    it('rejects query params', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        // @ts-expect-error the endpoint takes no query
        const res = await api.fetch(route, { method: 'GET', session, query: { env: 'dev' } });
        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_query_params');
    });

    it('returns 400 on a build without a license public key', async () => {
        state.publicKeyPem = null;
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const res = await api.fetch(route, { method: 'GET', session });
        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('no_license_public_key');
    });

    it.each(['administrator', 'production_support'] as const)('returns the versions and the license to %s', async (role) => {
        const { user } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true } });
        await userService.update({ id: user.id, role });
        const session = await authenticateUser(api, user);
        const res = await api.fetch(route, { method: 'GET', session });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data).toStrictEqual({ version: NANGO_VERSION, managedVersion: null, commit: null, license: { status: 'valid', license } });
    });

    it('reports a missing license when NANGO_LICENSE is not set', async () => {
        state.envelope = undefined;
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const res = await api.fetch(route, { method: 'GET', session });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.license).toStrictEqual({ status: 'missing' });
    });
});
