import jwt from 'jsonwebtoken';
import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import sandboxApiKeyService, { decryptSandboxSigningSecret, sandboxApiKeyPrefix } from './sandbox-api-key.service.js';

import type { DBCustomerKey } from '@nangohq/types';

describe('customer key sandbox token service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('should cap sandbox API key token expiration to one day', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const issuedAtBeforeCall = Date.now();

        const sandboxToken = (
            await sandboxApiKeyService.createSandboxApiKey(db.knex, {
                parentApiKeyId: apiKey.id,
                environmentId: env.id,
                purpose: 'dryrun',
                expiresAt: new Date(issuedAtBeforeCall + 7 * 24 * 60 * 60 * 1000)
            })
        ).unwrap();
        const issuedAtAfterCall = Date.now();

        const decoded = jwt.decode(sandboxToken.slice(sandboxApiKeyPrefix.length));
        if (!decoded || typeof decoded === 'string') {
            throw new Error('expected decoded JWT payload');
        }

        expect(decoded.exp).toBeGreaterThanOrEqual(Math.floor((issuedAtBeforeCall + 24 * 60 * 60 * 1000) / 1000));
        expect(decoded.exp).toBeLessThanOrEqual(Math.ceil((issuedAtAfterCall + 24 * 60 * 60 * 1000) / 1000));
    });

    it('should reject sandbox API key creation when expiration is not in the future', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();

        const sandboxToken = await sandboxApiKeyService.createSandboxApiKey(db.knex, {
            parentApiKeyId: apiKey.id,
            environmentId: env.id,
            purpose: 'dryrun',
            expiresAt: new Date(Date.now() - 60 * 1000)
        });

        if (sandboxToken.isOk()) {
            throw new Error('expected sandbox API key creation to fail');
        }

        expect(sandboxToken.error.message).toBe('Sandbox API key expiresAt must be in the future');
    });

    it('should store sandbox signing secrets encrypted when encryption is enabled', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();

        (
            await sandboxApiKeyService.createSandboxApiKey(db.knex, {
                parentApiKeyId: apiKey.id,
                environmentId: env.id,
                purpose: 'dryrun',
                expiresAt: new Date(Date.now() + 60 * 1000)
            })
        ).unwrap();

        const rawKey = await db.knex<DBCustomerKey>('customer_keys').where({ id: apiKey.id }).first();
        expect(rawKey).toBeDefined();
        expect(rawKey!.sandbox_signing_secret).toBeTruthy();
        expect(rawKey!.sandbox_signing_secret_iv).toBeTruthy();
        expect(rawKey!.sandbox_signing_secret_tag).toBeTruthy();

        const decryptedSigningSecret = decryptSandboxSigningSecret(rawKey!);
        expect(decryptedSigningSecret).toBeTruthy();
        expect(rawKey!.sandbox_signing_secret).not.toEqual(decryptedSigningSecret);
    });
});
