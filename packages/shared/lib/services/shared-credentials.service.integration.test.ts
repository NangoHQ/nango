import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import sharedCredentialsService from './shared-credentials.service.js';

import type { SharedCredentialsBodyInput } from '@nangohq/types';

describe('Shared credentials service integration tests', () => {
    const createdIds: number[] = [];

    async function create(input: SharedCredentialsBodyInput) {
        const id = (await sharedCredentialsService.createSharedCredentials(input)).unwrap();
        createdIds.push(id);
        return id;
    }

    beforeAll(async () => {
        await multipleMigrations();
    });

    afterAll(async () => {
        if (createdIds.length > 0) {
            await db.knex('providers_shared_credentials').whereIn('id', createdIds).delete();
        }
    });

    describe('createSharedCredentials', () => {
        it('should round-trip app_link through create and getSharedCredentialsById', async () => {
            const created = await create({
                name: 'github-app-test',
                client_id: 'app-id-123',
                client_secret: 'private-key-content',
                app_link: 'https://github.com/apps/some-app'
            });

            const fetched = (await sharedCredentialsService.getSharedCredentialsById(created)).unwrap();

            expect(fetched.name).toBe('github-app-test');
            expect(fetched.credentials.app_link).toBe('https://github.com/apps/some-app');
            expect(fetched.credentials.oauth_client_id).toBe('app-id-123');
            expect(fetched.credentials.oauth_client_secret).toBe('private-key-content');
        });

        it('should not set app_link when not provided (oauth2-style provider)', async () => {
            const created = await create({
                name: 'oauth2-test',
                client_id: 'client-id-123',
                client_secret: 'client-secret-123'
            });

            const fetched = (await sharedCredentialsService.getSharedCredentialsById(created)).unwrap();

            expect(fetched.credentials.app_link).toBeUndefined();
        });
    });

    describe('editSharedCredentials', () => {
        it('should update app_link through edit and getSharedCredentialsById', async () => {
            const created = await create({
                name: 'github-app-edit-test',
                client_id: 'app-id-456',
                client_secret: 'private-key-content',
                app_link: 'https://github.com/apps/original-app'
            });

            (
                await sharedCredentialsService.editSharedCredentials(created, {
                    name: 'github-app-edit-test',
                    client_id: 'app-id-456',
                    client_secret: 'private-key-content',
                    app_link: 'https://github.com/apps/updated-app'
                })
            ).unwrap();

            const fetched = (await sharedCredentialsService.getSharedCredentialsById(created)).unwrap();

            expect(fetched.credentials.app_link).toBe('https://github.com/apps/updated-app');
        });
    });

    describe('listSharedCredentials', () => {
        it('should include app_link in listed results', async () => {
            const created = await create({
                name: 'github-app-list-test',
                client_id: 'app-id-789',
                client_secret: 'private-key-content',
                app_link: 'https://github.com/apps/listed-app'
            });

            const list = (await sharedCredentialsService.listSharedCredentials()).unwrap();

            const found = list.find((item) => item.id === created);
            expect(found?.credentials.app_link).toBe('https://github.com/apps/listed-app');
        });
    });
});
