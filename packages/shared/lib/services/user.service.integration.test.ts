import { v4 as uuid } from 'uuid';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { createAccount as createTestAccount } from '../seeders/account.seeder.js';
import { productTracking } from '../utils/productTracking.js';
import userService from './user.service.js';

import type { DBTeam, DBUser } from '@nangohq/types';

describe('User service - case-insensitive email', () => {
    let account: DBTeam;

    beforeAll(async () => {
        await multipleMigrations();
        account = await createTestAccount();
    });

    async function createUser(email: string): Promise<DBUser> {
        const user = await userService.createUser({
            email,
            name: 'Test',
            account_id: account.id,
            email_verified: true
        });
        if (!user) {
            throw new Error('Failed to create user');
        }
        return user;
    }

    it('lowercases the email on creation', async () => {
        const local = uuid();
        const user = await createUser(`  ${local.toUpperCase()}@Example.COM  `);

        expect(user.email).toBe(`${local}@example.com`);
    });

    it('finds a user regardless of the casing of the lookup input', async () => {
        const local = uuid();
        const created = await createUser(`${local}@example.com`);

        const found = await userService.getUserByEmail(`${local.toUpperCase()}@EXAMPLE.COM`);

        expect(found?.id).toBe(created.id);
    });

    it('finds a legacy row stored with mixed casing when looked up with different casing', async () => {
        // Simulate pre-migration data by inserting a row that bypasses createUser normalization.
        const local = uuid();
        const storedEmail = `${local}@Example.COM`;
        const [inserted] = await db.knex
            .from<DBUser>('_nango_users')
            .insert({
                email: storedEmail,
                name: 'Legacy',
                hashed_password: '',
                salt: '',
                account_id: account.id,
                email_verified: true,
                role: 'administrator'
            })
            .returning('id');

        const found = await userService.getUserByEmail(`${local}@example.com`);

        expect(found?.id).toBe(inserted!.id);
        expect(found?.email).toBe(storedEmail);
    });
});

describe('User service - tracking', () => {
    let account: DBTeam;

    beforeAll(async () => {
        await multipleMigrations();
        account = await createTestAccount();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        { hashed_password: 'hash', method: 'password' },
        { hashed_password: '', method: 'google' }
    ])('tracks a $method user', async ({ hashed_password, method }) => {
        const track = vi.spyOn(productTracking, 'track');

        const user = await userService.createUser({
            email: `${uuid()}@example.com`,
            name: 'Test',
            hashed_password,
            account_id: account.id,
            email_verified: true
        });

        expect(track).toHaveBeenCalledWith({ name: 'auth:user_create', team: { id: account.id }, user, eventProperties: { method } });
    });
});
