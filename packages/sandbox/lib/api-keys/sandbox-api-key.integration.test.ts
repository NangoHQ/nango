import jwt from 'jsonwebtoken';
import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import sandboxApiKeyService, { sandboxApiKeyPrefix } from './sandbox-api-key.service.js';

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
});
