import { beforeAll, describe, expect, it } from 'vitest';

import { multipleMigrations } from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import integrationService from './integration.service.js';

describe('integrationService integration', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('decodes APP private keys loaded from the database', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const privateKey = '-----BEGIN RSA PRIVATE KEY-----\nprivate-key\n-----END RSA PRIVATE KEY-----';
        const storedPrivateKey = Buffer.from(privateKey).toString('base64');
        await seeders.createConfigSeed(env, 'github-app', 'github-app', {
            oauth_client_id: 'app-id',
            oauth_client_secret: storedPrivateKey,
            app_link: 'https://github.com/apps/example'
        });

        const result = await integrationService.get({
            environmentId: env.id,
            environmentUuid: env.uuid,
            integrationId: 'github-app',
            includeCredentials: true
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.integration.oauth_client_secret).toBe(storedPrivateKey);
            expect(result.value.credentials).toStrictEqual({
                type: 'APP',
                appId: 'app-id',
                privateKey,
                appLink: 'https://github.com/apps/example'
            });
        }
    });
});
