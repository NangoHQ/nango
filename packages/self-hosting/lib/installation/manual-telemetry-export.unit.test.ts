import { generateKeyPairSync, sign } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { signLicense } from '@nangohq/license';

import { envs } from '../env.js';
import { manualTelemetryExportConfig } from './manual-telemetry-export.js';

import type * as NangoLicense from '@nangohq/license';
import type { Knex } from 'knex';

const telemetryDb = vi.hoisted(() => ({ current: {} as unknown }));
const trusted = vi.hoisted(() => ({ publicKeyPem: null as string | null }));

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
const exportKey = 'k'.repeat(48);

async function license(telemetry: boolean): Promise<string> {
    const signed = await signLicense(
        {
            version: 1,
            installation_id: 'f4a2c0e1-7b3d-4e2a-9c1f-0a6d5e8b2c44',
            name: 'acme/prod',
            issued_at: '2026-11-01T00:00:00.000Z',
            expires_at: '2027-11-01T00:00:00.000Z',
            grace_until: '2028-01-30T00:00:00.000Z',
            telemetry
        },
        { publicKeyPem, sign: (data) => Promise.resolve(sign('sha256', data, privateKey)) }
    );
    return signed.envelope;
}

beforeEach(async () => {
    envs.NANGO_HOSTED_TELEMETRY_MANUAL_EXPORT_KEY = exportKey;
    envs.NANGO_INSTALLATION_PRIVATE_KEY = installationKey;
    envs.NANGO_LICENSE = await license(true);
    trusted.publicKeyPem = publicKeyPem;
    telemetryDb.current = {} as Knex;
});

describe('manualTelemetryExportConfig', () => {
    it('reads the installation from the license and the keys from the environment', async () => {
        expect((await manualTelemetryExportConfig()).unwrap()).toEqual({
            key: exportKey,
            knex: telemetryDb.current,
            installationId: 'f4a2c0e1-7b3d-4e2a-9c1f-0a6d5e8b2c44',
            privateKeyPem: installationKey.trim(),
            metrics: ['nango.hosted_metric.active_concurrency.max']
        });
    });

    it('does not depend on the license asking for telemetry', async () => {
        envs.NANGO_LICENSE = await license(false);

        expect((await manualTelemetryExportConfig()).unwrap()).toMatchObject({ installationId: 'f4a2c0e1-7b3d-4e2a-9c1f-0a6d5e8b2c44' });
    });

    it('returns no configuration without an export key, even when nothing else is set', async () => {
        envs.NANGO_HOSTED_TELEMETRY_MANUAL_EXPORT_KEY = undefined;
        envs.NANGO_LICENSE = undefined;
        envs.NANGO_INSTALLATION_PRIVATE_KEY = undefined;

        expect((await manualTelemetryExportConfig()).unwrap()).toBeNull();
    });

    it.each([
        ['the license is not set', () => (envs.NANGO_LICENSE = undefined), 'NANGO_LICENSE is not set'],
        ['the installation private key is not set', () => (envs.NANGO_INSTALLATION_PRIVATE_KEY = undefined), 'NANGO_INSTALLATION_PRIVATE_KEY is not set'],
        ['there is no telemetry database', () => (telemetryDb.current = undefined), 'hosted telemetry has no database']
    ])('returns an error when %s', async (_name, arrange, message) => {
        arrange();

        const config = await manualTelemetryExportConfig();

        expect(config.isErr() && config.error.message).toEqual(message);
    });
});
