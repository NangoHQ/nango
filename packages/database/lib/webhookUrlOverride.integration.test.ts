import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from './index.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { backfillWebhookUrlOverride } = require('./migration-helpers/webhookUrlOverride.cjs');

describe('backfillWebhookUrlOverride', () => {
    const createdConnectionIds: number[] = [];
    let accountId: number;
    let environmentId: number;
    let configId: number;

    beforeAll(async () => {
        await multipleMigrations();

        const [account] = await db.knex
            .insert({ name: `test-account-${randomUUID()}` })
            .into('_nango_accounts')
            .returning('*');
        accountId = account.id;
        const [env] = await db.knex.insert({ account_id: accountId, name: 'dev' }).into('_nango_environments').returning('*');
        environmentId = env.id;
        const [config] = await db.knex
            .insert({ environment_id: environmentId, unique_key: `test-${randomUUID()}`, provider: 'github' })
            .into('_nango_configs')
            .returning('*');
        configId = config.id;
    });

    afterAll(async () => {
        if (createdConnectionIds.length > 0) {
            await db.knex('_nango_connections').whereIn('id', createdConnectionIds).del();
        }
        if (configId) {
            await db.knex('_nango_configs').where('id', configId).del();
        }
        if (environmentId) {
            await db.knex('_nango_environments').where('id', environmentId).del();
        }
        if (accountId) {
            await db.knex('_nango_accounts').where('id', accountId).del();
        }
    });

    async function createConnection(connectionConfig: Record<string, unknown>): Promise<number> {
        const [connection] = await db.knex
            .insert({
                environment_id: environmentId,
                config_id: configId,
                provider_config_key: 'github',
                connection_id: `conn-${randomUUID()}`,
                credentials: {},
                connection_config: connectionConfig
            })
            .into('_nango_connections')
            .returning('*');
        createdConnectionIds.push(connection.id);
        return connection.id;
    }

    async function read(id: number): Promise<{ webhook_url_override: string | null; connection_config: Record<string, unknown> }> {
        return db.knex.select('webhook_url_override', 'connection_config').from('_nango_connections').where({ id }).first();
    }

    it('moves connection_config.webhook_url into the column and strips the key', async () => {
        const id = await createConnection({ webhook_url: 'https://example.com/hook', oauth_scopes: 'repo' });

        await backfillWebhookUrlOverride(db.knex);

        const row = await read(id);
        expect(row.webhook_url_override).toBe('https://example.com/hook');
        expect(row.connection_config).toEqual({ oauth_scopes: 'repo' });
    });

    it('trims surrounding whitespace', async () => {
        const id = await createConnection({ webhook_url: '  https://example.com/hook  ' });

        await backfillWebhookUrlOverride(db.knex);

        expect((await read(id)).webhook_url_override).toBe('https://example.com/hook');
    });

    it('sets the column to null when webhook_url is empty or whitespace, still stripping the key', async () => {
        const id = await createConnection({ webhook_url: '   ' });

        await backfillWebhookUrlOverride(db.knex);

        const row = await read(id);
        expect(row.webhook_url_override).toBeNull();
        expect(row.connection_config).toEqual({});
    });

    it('leaves connections without a webhook_url untouched', async () => {
        const id = await createConnection({ oauth_scopes: 'repo' });

        await backfillWebhookUrlOverride(db.knex);

        const row = await read(id);
        expect(row.webhook_url_override).toBeNull();
        expect(row.connection_config).toEqual({ oauth_scopes: 'repo' });
    });

    it('is idempotent on consecutive runs', async () => {
        const id = await createConnection({ webhook_url: 'https://example.com/hook' });

        await backfillWebhookUrlOverride(db.knex);
        const after1 = await read(id);

        await backfillWebhookUrlOverride(db.knex);
        const after2 = await read(id);

        expect(after2).toEqual(after1);
    });
});
