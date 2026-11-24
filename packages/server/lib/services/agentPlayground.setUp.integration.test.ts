import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { configService, seeders } from '@nangohq/shared';

import { setUpPlaygroundIntegration } from './agentPlayground.service.js';

describe('setUpPlaygroundIntegration', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('adds an app that needs no developer app, such as an API key app, named after the provider', async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();

        const setup = await setUpPlaygroundIntegration({ account, environment: env }, 'resend');

        expect(setup).toEqual({ provider: 'resend', displayName: 'Resend', integrationId: 'resend', outcome: 'created', usesSharedCredentials: false });
        const integrations = await configService.listProviderConfigs(db.knex, env.id);
        expect(integrations.map(({ unique_key, missing_fields }) => ({ unique_key, missing_fields }))).toEqual([{ unique_key: 'resend', missing_fields: [] }]);
    });

    it("adds nothing for an OAuth app Nango hosts no app for, since it needs the user's own", async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();

        const setup = await setUpPlaygroundIntegration({ account, environment: env }, 'outlook');

        expect(setup).toEqual({ provider: 'outlook', displayName: 'Outlook', outcome: 'needs_developer_app' });
        expect(await configService.listProviderConfigs(db.knex, env.id)).toEqual([]);
    });

    it('leaves adding an instant setup app to the user in a production environment', async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();

        const setup = await setUpPlaygroundIntegration({ account, environment: { ...env, is_production: true } }, 'resend');

        expect(setup).toEqual({ provider: 'resend', displayName: 'Resend', outcome: 'needs_confirmation' });
        expect(await configService.listProviderConfigs(db.knex, env.id)).toEqual([]);
    });
});
