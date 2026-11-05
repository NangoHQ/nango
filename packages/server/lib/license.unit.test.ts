import { generateKeyPairSync, sign } from 'node:crypto';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { signLicense } from '@nangohq/license';

import { checkEnterpriseLicense } from './license.js';

import type * as licenseModule from '@nangohq/license';
import type { License } from '@nangohq/types';
import type * as utilsModule from '@nangohq/utils';

const state = vi.hoisted(() => ({
    publicKeyPem: null as string | null,
    envs: { NANGO_LICENSE_CHECK: false, NANGO_LICENSE: undefined as string | undefined },
    logger: { info: vi.fn(), warning: vi.fn() },
    isCloud: false
}));

vi.mock('./env.js', () => ({ envs: state.envs }));
vi.mock('@nangohq/license', async (importOriginal) => ({
    ...(await importOriginal<typeof licenseModule>()),
    get licensePublicKey() {
        return state.publicKeyPem;
    }
}));
vi.mock('@nangohq/utils', async (importOriginal) => ({
    ...(await importOriginal<typeof utilsModule>()),
    getLogger: () => state.logger,
    get isCloud() {
        return state.isCloud;
    }
}));

function keyPair() {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    return {
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        sign: (data: Buffer) => Promise.resolve(sign('sha256', data, privateKey))
    };
}

const key = keyPair();
const license: License = {
    version: 1,
    installation_id: 'f4a2c0e1-7b3d-4e2a-9c1f-0a6d5e8b2c44',
    name: 'acme/prod',
    issued_at: '2026-01-01T00:00:00Z',
    expires_at: '2027-01-01T00:00:00Z',
    grace_until: '2027-04-01T00:00:00Z',
    telemetry: true
};

describe('checkEnterpriseLicense', () => {
    let envelope: string;

    beforeAll(async () => {
        envelope = await signLicense(license, key);
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ now: new Date('2026-06-01T00:00:00Z') });
        state.isCloud = false;
        state.publicKeyPem = key.publicKeyPem;
        state.envs.NANGO_LICENSE_CHECK = true;
        state.envs.NANGO_LICENSE = envelope;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does nothing when NANGO_LICENSE_CHECK is not set', async () => {
        state.envs.NANGO_LICENSE_CHECK = false;
        await checkEnterpriseLicense();
        expect(state.logger.info).toHaveBeenCalledWith('License check disabled: NANGO_LICENSE_CHECK is not set.');
        expect(state.logger.warning).not.toHaveBeenCalled();
    });

    it('is silent in cloud even with a key and the flag', async () => {
        state.isCloud = true;
        await checkEnterpriseLicense();
        expect(state.logger.info).not.toHaveBeenCalled();
        expect(state.logger.warning).not.toHaveBeenCalled();
    });

    it('is silent in a build without a compiled-in key, flag or not', async () => {
        state.publicKeyPem = null;
        await checkEnterpriseLicense();
        state.envs.NANGO_LICENSE_CHECK = false;
        await checkEnterpriseLicense();
        expect(state.logger.info).not.toHaveBeenCalled();
        expect(state.logger.warning).not.toHaveBeenCalled();
    });

    it('accepts a valid license', async () => {
        await checkEnterpriseLicense();
        expect(state.logger.info).toHaveBeenCalledWith('License for acme/prod (f4a2c0e1-7b3d-4e2a-9c1f-0a6d5e8b2c44) is valid until 2027-01-01T00:00:00Z.');
        expect(state.logger.warning).not.toHaveBeenCalled();
    });

    it('warns about an expired license that is still in its grace period', async () => {
        vi.setSystemTime(new Date('2027-02-01T00:00:00Z'));
        await checkEnterpriseLicense();
        expect(state.logger.warning).toHaveBeenCalledWith(
            'License for acme/prod (f4a2c0e1-7b3d-4e2a-9c1f-0a6d5e8b2c44) expired on 2027-01-01T00:00:00Z. Renew it before 2027-04-01T00:00:00Z.'
        );
    });

    it('fails a license past its grace period', async () => {
        vi.setSystemTime(new Date('2027-04-01T00:00:01Z'));
        await checkEnterpriseLicense();
        expect(state.logger.warning).toHaveBeenCalledWith(
            'License check failed: license for acme/prod expired on 2027-01-01T00:00:00Z and its grace period ended on 2027-04-01T00:00:00Z.'
        );
    });

    it('fails when NANGO_LICENSE is not set', async () => {
        state.envs.NANGO_LICENSE = undefined;
        await checkEnterpriseLicense();
        expect(state.logger.warning).toHaveBeenCalledWith('License check failed: NANGO_LICENSE is not set.');
    });

    it('fails a license signed by a key this build does not trust', async () => {
        state.envs.NANGO_LICENSE = await signLicense(license, keyPair());
        await checkEnterpriseLicense();
        expect(state.logger.warning).toHaveBeenCalledWith(expect.stringContaining('this build trusts'));
    });

    it('fails a value that is not a license', async () => {
        state.envs.NANGO_LICENSE = 'not-a-license';
        await checkEnterpriseLicense();
        expect(state.logger.warning).toHaveBeenCalledWith('License check failed: license is not a compact JWS.');
    });
});
