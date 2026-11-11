import { generateKeyPairSync, sign } from 'node:crypto';

import * as cron from 'node-cron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signLicense } from '@nangohq/license';
import { flags, Ok } from '@nangohq/utils';

import { envs } from '../../env.js';
import { uploadQueuedDays } from '../uploader.js';
import { exec, uploaderConfig, uploadTelemetryCron } from './uploadTelemetry.js';

import type { UploaderConfig } from '../uploader.js';
import type * as NangoLicense from '@nangohq/license';
import type { License } from '@nangohq/types';
import type { Knex } from 'knex';

const telemetryDb = vi.hoisted(() => ({ current: {} as unknown }));
const trusted = vi.hoisted(() => ({ publicKeyPem: null as string | null }));

vi.mock('node-cron', () => ({ schedule: vi.fn() }));
vi.mock('../uploader.js', () => ({ uploadQueuedDays: vi.fn() }));
vi.mock('@nangohq/hosted-telemetry', () => ({ hostedTelemetryDb: () => telemetryDb.current }));
vi.mock('@nangohq/license', async () => {
    const actual: typeof NangoLicense = await vi.importActual('@nangohq/license');
    return {
        ...actual,
        get licensePublicKey() {
            return trusted.publicKeyPem;
        }
    };
});

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const installationKey = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

async function license(overrides: Partial<License> = {}): Promise<string> {
    const signed = await signLicense(
        {
            version: 1,
            installation_id: 'f4a2c0e1-7b3d-4e2a-9c1f-0a6d5e8b2c44',
            name: 'acme/prod',
            issued_at: '2026-11-01T00:00:00.000Z',
            expires_at: '2027-11-01T00:00:00.000Z',
            grace_until: '2028-01-30T00:00:00.000Z',
            telemetry: true,
            ...overrides
        },
        { publicKeyPem, sign: (data) => Promise.resolve(sign('sha256', data, privateKey)) }
    );
    return signed.envelope;
}

beforeEach(async () => {
    flags.hasHostedTelemetryUpload = true;
    envs.NANGO_INSTALLATION_PRIVATE_KEY = installationKey;
    envs.NANGO_LICENSE = await license();
    trusted.publicKeyPem = publicKeyPem;
    telemetryDb.current = {} as Knex;
});

afterEach(() => {
    vi.mocked(cron.schedule).mockReset();
    vi.mocked(uploadQueuedDays).mockReset();
    vi.restoreAllMocks();
});

describe('uploaderConfig', () => {
    it('reads the installation from the license and the rest from the environment', async () => {
        expect((await uploaderConfig()).unwrap()).toEqual({
            knex: telemetryDb.current,
            installationId: 'f4a2c0e1-7b3d-4e2a-9c1f-0a6d5e8b2c44',
            privateKeyPem: installationKey.trim(),
            url: 'https://installations.nango.dev',
            backfillDays: 30,
            licenseGraceUntil: new Date('2028-01-30T00:00:00.000Z')
        });
    });

    it('accepts a private key whose line breaks are written as \\n, as in a one-line env value', async () => {
        envs.NANGO_INSTALLATION_PRIVATE_KEY = installationKey.trim().replaceAll('\n', '\\n');

        expect((await uploaderConfig()).unwrap()?.privateKeyPem).toBe(installationKey.trim());
    });

    it.each([
        ['the installation private key is not set', () => (envs.NANGO_INSTALLATION_PRIVATE_KEY = undefined), 'NANGO_INSTALLATION_PRIVATE_KEY is not set'],
        [
            'the installation private key cannot sign',
            () => (envs.NANGO_INSTALLATION_PRIVATE_KEY = 'not a key'),
            'NANGO_INSTALLATION_PRIVATE_KEY cannot sign an installation token'
        ],
        ['the license is not set', () => (envs.NANGO_LICENSE = undefined), 'NANGO_LICENSE is not set'],
        ['the build has no license public key', () => (trusted.publicKeyPem = null), 'this build has no license public key'],
        ['the license does not verify', () => (envs.NANGO_LICENSE = 'not.a.license'), expect.stringContaining('the license does not verify')],
        ['there is no telemetry database', () => (telemetryDb.current = undefined), 'hosted telemetry has no database']
    ])('returns an error when %s', async (_name, arrange, message) => {
        arrange();

        const config = await uploaderConfig();

        expect(config.isErr() && config.error.message).toEqual(message);
    });

    it('returns no configuration when the license does not ask for telemetry, even without a private key', async () => {
        envs.NANGO_LICENSE = await license({ telemetry: false });
        envs.NANGO_INSTALLATION_PRIVATE_KEY = undefined;

        expect((await uploaderConfig()).unwrap()).toBeNull();
    });
});

describe('uploadTelemetryCron', () => {
    it('runs every hour, at a random minute from 15 to 59', async () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.999);

        await uploadTelemetryCron();
        await uploadTelemetryCron();

        expect(vi.mocked(cron.schedule).mock.calls.map(([expression]) => expression)).toEqual(['15 * * * *', '59 * * * *']);
    });

    it('does not run when the flag is off', async () => {
        flags.hasHostedTelemetryUpload = false;

        await uploadTelemetryCron();

        expect(cron.schedule).not.toHaveBeenCalled();
    });

    it('does not run when the configuration is incomplete', async () => {
        envs.NANGO_INSTALLATION_PRIVATE_KEY = undefined;

        await uploadTelemetryCron();

        expect(cron.schedule).not.toHaveBeenCalled();
    });
});

describe('exec', () => {
    const config: UploaderConfig = {
        knex: {} as Knex,
        installationId: 'f4a2c0e1-7b3d-4e2a-9c1f-0a6d5e8b2c44',
        privateKeyPem: installationKey,
        url: 'https://installations.nango.dev',
        backfillDays: 30,
        licenseGraceUntil: new Date(Date.now() + 60_000)
    };

    beforeEach(() => {
        vi.mocked(uploadQueuedDays).mockResolvedValue(Ok({ succeeded: 0, failed: 0, outOfTime: false }));
    });

    it('uploads while the license is within its grace period', async () => {
        await exec(config);

        expect(uploadQueuedDays).toHaveBeenCalledWith(config, { deadline: expect.any(Date) });
    });

    it('does not upload once the license is past its grace period', async () => {
        await exec({ ...config, licenseGraceUntil: new Date(Date.now() - 1000) });

        expect(uploadQueuedDays).not.toHaveBeenCalled();
    });
});
