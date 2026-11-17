import { generateKeyPairSync, sign } from 'node:crypto';

import tracer from 'dd-trace';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signLicense } from '@nangohq/license';
import { Err, flags, Ok } from '@nangohq/utils';

import { envs } from '../../env.js';
import { fillUploadQueue, uploadNextPage, UploadRequestError } from '../uploader.js';
import { uploaderConfig, uploadTelemetryDaemon, uploadTelemetryTick } from './uploadTelemetry.daemon.js';

import type * as Uploader from '../uploader.js';
import type { UploaderConfig } from '../uploader.js';
import type * as NangoLicense from '@nangohq/license';
import type { License } from '@nangohq/types';
import type { Knex } from 'knex';

const telemetryDb = vi.hoisted(() => ({ current: {} as unknown }));
const trusted = vi.hoisted(() => ({ publicKeyPem: null as string | null }));

vi.mock('../uploader.js', async () => {
    const actual: typeof Uploader = await vi.importActual('../uploader.js');
    return { UploadRequestError: actual.UploadRequestError, fillUploadQueue: vi.fn(), uploadNextPage: vi.fn() };
});
vi.mock('@nangohq/hosted-telemetry', () => ({
    hostedTelemetryDb: () => telemetryDb.current,
    storedMetricNames: () => ['nango.hosted_metric.active_concurrency.max']
}));
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
    envs.NANGO_INSTALLATIONS_API_URL = 'https://installations.example.com';
    envs.NANGO_LICENSE = await license();
    trusted.publicKeyPem = publicKeyPem;
    telemetryDb.current = {} as Knex;
});

afterEach(() => {
    vi.mocked(fillUploadQueue).mockReset();
    vi.mocked(uploadNextPage).mockReset();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('uploaderConfig', () => {
    it('reads the installation from the license and the rest from the environment', async () => {
        expect((await uploaderConfig()).unwrap()).toEqual({
            knex: telemetryDb.current,
            installationId: 'f4a2c0e1-7b3d-4e2a-9c1f-0a6d5e8b2c44',
            privateKeyPem: installationKey.trim(),
            url: 'https://installations.example.com',
            backfillDays: 30,
            metrics: ['nango.hosted_metric.active_concurrency.max'],
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
            expect.stringMatching(/^NANGO_INSTALLATION_PRIVATE_KEY cannot sign an installation token: .+/)
        ],
        ['the installations URL is not set', () => (envs.NANGO_INSTALLATIONS_API_URL = undefined), 'NANGO_INSTALLATIONS_API_URL is not set'],
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

describe('uploadTelemetryDaemon', () => {
    beforeEach(() => {
        vi.mocked(fillUploadQueue).mockResolvedValue(Ok({ expired: 0 }));
        vi.mocked(uploadNextPage).mockResolvedValue(Ok({ outcome: 'idle' }));
    });

    it('starts uploading, and stops when aborted', async () => {
        const daemon = await uploadTelemetryDaemon();
        await daemon?.abort();

        expect(fillUploadQueue).toHaveBeenCalledTimes(1);
        expect(uploadNextPage).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['the flag is off', () => (flags.hasHostedTelemetryUpload = false)],
        ['the configuration is incomplete', () => (envs.NANGO_INSTALLATION_PRIVATE_KEY = undefined)]
    ])('does not start when %s', async (_name, arrange) => {
        arrange();

        expect(await uploadTelemetryDaemon()).toBeUndefined();
        expect(fillUploadQueue).not.toHaveBeenCalled();
    });
});

describe('uploadTelemetryTick', () => {
    const start = new Date('2026-11-10T08:00:00Z');
    const config: UploaderConfig = {
        knex: {} as Knex,
        installationId: 'f4a2c0e1-7b3d-4e2a-9c1f-0a6d5e8b2c44',
        privateKeyPem: installationKey,
        url: 'https://installations.example.com',
        backfillDays: 30,
        metrics: [],
        licenseGraceUntil: new Date('2028-01-30T00:00:00Z')
    };
    const after = (minutes: number) => vi.setSystemTime(start.getTime() + minutes * 60_000);
    const calls = () => ({ fills: vi.mocked(fillUploadQueue).mock.calls.length, pages: vi.mocked(uploadNextPage).mock.calls.length });

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'], now: start });
        vi.mocked(fillUploadQueue).mockResolvedValue(Ok({ expired: 0 }));
        vi.mocked(uploadNextPage).mockResolvedValue(Ok({ outcome: 'sent', day: '2026-11-09', metric: 'nango.hosted_metric.active_concurrency.max' }));
    });

    it('fills the queue on its first tick, then sends a page on every tick', async () => {
        const tick = uploadTelemetryTick(config);

        await tick();
        await tick();
        await tick();

        expect(calls()).toEqual({ fills: 1, pages: 3 });
        expect(fillUploadQueue).toHaveBeenCalledWith(config);
        expect(uploadNextPage).toHaveBeenCalledWith(config, { rejectedBefore: start });
    });

    it('starts a new loop an hour later: it fills the queue again and lets the rejected uploads be sent again', async () => {
        const tick = uploadTelemetryTick(config);

        await tick();
        after(59);
        await tick();
        after(60);
        await tick();

        expect(calls()).toEqual({ fills: 2, pages: 3 });
        expect(vi.mocked(uploadNextPage).mock.calls.map(([, { rejectedBefore }]) => rejectedBefore)).toEqual([
            start,
            start,
            new Date(start.getTime() + 60 * 60_000)
        ]);
    });

    it('keeps uploading after Nango rejects an upload', async () => {
        const rejection = new UploadRequestError('Nango answered 400', { status: 400, code: 'invalid_row' });
        vi.mocked(uploadNextPage).mockResolvedValueOnce(
            Ok({ outcome: 'rejected', day: '2026-11-09', metric: 'nango.hosted_metric.active_concurrency.max', rejection })
        );
        const tick = uploadTelemetryTick(config);

        await tick();
        await tick();

        expect(calls()).toEqual({ fills: 1, pages: 2 });
    });

    it.each([
        ['nothing is left to upload', () => vi.mocked(uploadNextPage).mockResolvedValueOnce(Ok({ outcome: 'idle' }))],
        ['a page cannot be sent', () => vi.mocked(uploadNextPage).mockResolvedValueOnce(Err(new Error('Nango answered 503')))]
    ])('does nothing until the next fill once %s', async (_name, arrange) => {
        arrange();
        const tick = uploadTelemetryTick(config);

        await tick();
        after(59);
        await tick();
        const resting = calls();
        after(60);
        await tick();

        expect(resting).toEqual({ fills: 1, pages: 1 });
        expect(calls()).toEqual({ fills: 2, pages: 2 });
    });

    it('uploads what is already queued when the queue cannot be filled, and fills it an hour later', async () => {
        vi.mocked(fillUploadQueue).mockResolvedValueOnce(Err(new Error('connection refused')));
        const tick = uploadTelemetryTick(config);

        await tick();
        await tick();
        const unfilled = calls();
        after(60);
        await tick();

        expect(unfilled).toEqual({ fills: 1, pages: 2 });
        expect(calls()).toEqual({ fills: 2, pages: 3 });
    });

    it('traces a tick with the upload it worked on, and with the error when there is one', async () => {
        const span = { addTags: vi.fn(), setTag: vi.fn() };
        vi.spyOn(tracer, 'trace').mockImplementation(((_name: string, fn: (span: unknown) => unknown) => fn(span)) as typeof tracer.trace);
        const upload = { day: '2026-11-09', metric: 'nango.hosted_metric.active_concurrency.max' };
        const rejection = new UploadRequestError('Nango answered 400', { status: 400, code: 'invalid_row' });
        const unreachable = new Error('could not reach Nango');
        vi.mocked(uploadNextPage)
            .mockResolvedValueOnce(Ok({ outcome: 'finished', ...upload }))
            .mockResolvedValueOnce(Ok({ outcome: 'rejected', ...upload, rejection }))
            .mockResolvedValueOnce(Err(unreachable));
        const tick = uploadTelemetryTick(config);

        await tick();
        await tick();
        await tick();

        expect(span.addTags.mock.calls).toEqual([[upload], [upload]]);
        expect(span.setTag.mock.calls).toEqual([
            ['outcome', 'finished'],
            ['outcome', 'rejected'],
            ['error', rejection],
            ['error', unreachable]
        ]);
    });

    it('stops uploading once the license is past its grace period', async () => {
        const tick = uploadTelemetryTick({ ...config, licenseGraceUntil: new Date(start.getTime() + 30 * 60_000) });

        await tick();
        after(30);
        await tick();
        after(120);
        await tick();

        expect(calls()).toEqual({ fills: 1, pages: 1 });
    });
});
