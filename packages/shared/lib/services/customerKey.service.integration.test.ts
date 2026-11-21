import * as uuid from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { seedAccountEnvAndUser } from '../seeders/global.seeder.js';

import type { DBCustomerKey } from '@nangohq/types';

describe('customer_keys hash uniqueness', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    function keyRow(accountId: number, keyType: DBCustomerKey['key_type'], hashed: string) {
        return { account_id: accountId, key_type: keyType, display_name: uuid.v4(), secret: uuid.v4(), hashed };
    }

    it('should reject two API keys with the same hash', async () => {
        const { account } = await seedAccountEnvAndUser();
        const hashed = uuid.v4();

        await db.knex('customer_keys').insert(keyRow(account.id, 'api', hashed));

        await expect(db.knex('customer_keys').insert(keyRow(account.id, 'api', hashed))).rejects.toMatchObject({ code: '23505' });
    });

    it('should allow two webhook signing keys with the same hash', async () => {
        const { account } = await seedAccountEnvAndUser();
        const hashed = uuid.v4();

        await db.knex('customer_keys').insert(keyRow(account.id, 'webhook_signing', hashed));

        await expect(db.knex('customer_keys').insert(keyRow(account.id, 'webhook_signing', hashed))).resolves.toBeDefined();
    });
});
