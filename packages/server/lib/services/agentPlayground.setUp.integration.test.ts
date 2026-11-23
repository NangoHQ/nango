import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { configService, seeders } from '@nangohq/shared';

import { ensurePlaygroundIntegration } from './agentPlayground.service.js';

describe('ensurePlaygroundIntegration', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('adds an app that needs no developer app, such as an API key app, named after the provider', async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();

        const setup = await ensurePlaygroundIntegration({ account, environment: env }, 'resend');

        expect(setup).toEqual({ provider: 'resend', displayName: 'Resend', integrationId: 'resend', outcome: 'created', usesSharedCredentials: false });
        const integrations = await configService.listProviderConfigs(db.knex, env.id);
        expect(integrations.map(({ unique_key, missing_fields }) => ({ unique_key, missing_fields }))).toEqual([{ unique_key: 'resend', missing_fields: [] }]);
    });

    it('adds an OAuth app on the developer app Nango hosts for it', async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();
        const sharedCredentials = await seeders.createSharedCredentialsSeed('github');

        const setup = await ensurePlaygroundIntegration({ account, environment: env }, 'github');

        expect(setup).toEqual({
            provider: 'github',
            displayName: 'GitHub (User OAuth)',
            integrationId: 'github',
            outcome: 'created',
            usesSharedCredentials: true
        });
        const integrations = await configService.listProviderConfigs(db.knex, env.id);
        expect(integrations.map(({ unique_key, shared_credentials_id }) => ({ unique_key, shared_credentials_id }))).toEqual([
            { unique_key: 'github', shared_credentials_id: sharedCredentials.id }
        ]);
    });

    it("picks another name when a different app's integration already uses the provider's", async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'resend', 'hubspot');

        const setup = await ensurePlaygroundIntegration({ account, environment: env }, 'resend');

        expect(setup).toMatchObject({ provider: 'resend', outcome: 'created', integrationId: expect.stringMatching(/^resend-[a-z0-9_-]{4}$/) });
    });

    it("adds nothing for an OAuth app Nango hosts no app for, since it needs the user's own", async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();

        const setup = await ensurePlaygroundIntegration({ account, environment: env }, 'outlook');

        expect(setup).toEqual({ provider: 'outlook', displayName: 'Outlook', outcome: 'needs_developer_app' });
        expect(await configService.listProviderConfigs(db.knex, env.id)).toEqual([]);
    });

    it('leaves adding an instant setup app to the user in a production environment', async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();

        const setup = await ensurePlaygroundIntegration({ account, environment: { ...env, is_production: true } }, 'resend');

        expect(setup).toEqual({ provider: 'resend', displayName: 'Resend', outcome: 'needs_confirmation' });
        expect(await configService.listProviderConfigs(db.knex, env.id)).toEqual([]);
    });
});
