import { beforeAll, describe, expect, it } from 'vitest';

import { multipleMigrations } from '@nangohq/database';

import configService from './config.service.js';
import { createConfigSeed } from '../seeders/config.seeder.js';
import { createEnvironmentSeed } from '../seeders/environment.seeder.js';

describe('Config service integration tests', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    describe('createProviderConfig', () => {
        it('should set missing fields', async () => {
            const env = await createEnvironmentSeed();

            const config = await createConfigSeed(env, 'google', 'google');

            expect(config.missing_fields).toEqual(expect.arrayContaining(['oauth_client_id', 'oauth_client_secret']));
        });
    });

    describe('validateProviderConfig', () => {
        it('should return an error for oauth config with no client id', () => {
            const maybeError = configService.validateProviderConfig('OAUTH1', {
                display_name: null,
                unique_key: 'abc123',
                provider: 'provider',
                oauth_client_id: '',
                oauth_client_secret: 'secret',
                environment_id: 1,
                created_at: new Date(),
                updated_at: new Date(),
                missing_fields: [],
                forward_webhooks: true,
                shared_credentials_id: null
            });

            expect(maybeError).toEqual(['oauth_client_id']);
        });

        it('should return an error for oauth config with no client secret', () => {
            const maybeError = configService.validateProviderConfig('OAUTH1', {
                display_name: null,
                unique_key: 'abc123',
                provider: 'provider',
                oauth_client_id: 'client',
                oauth_client_secret: '',
                environment_id: 1,
                created_at: new Date(),
                updated_at: new Date(),
                missing_fields: [],
                forward_webhooks: true,
                shared_credentials_id: null
            });

            expect(maybeError).toEqual(['oauth_client_secret']);
        });

        it('should return an error for app config with no client id', () => {
            const maybeError = configService.validateProviderConfig('APP', {
                display_name: null,
                unique_key: 'abc123',
                provider: 'provider',
                oauth_client_id: '',
                oauth_client_secret: 'secret',
                app_link: 'link',
                environment_id: 1,
                created_at: new Date(),
                updated_at: new Date(),
                missing_fields: [],
                forward_webhooks: true,
                shared_credentials_id: null
            });

            expect(maybeError).toEqual(['oauth_client_id']);
        });

        it('should return an error for app config with no client secret', () => {
            const maybeError = configService.validateProviderConfig('APP', {
                display_name: null,
                unique_key: 'abc123',
                provider: 'provider',
                oauth_client_id: 'id',
                oauth_client_secret: '',
                app_link: 'link',
                environment_id: 1,
                created_at: new Date(),
                updated_at: new Date(),
                missing_fields: [],
                forward_webhooks: true,
                shared_credentials_id: null
            });

            expect(maybeError).toEqual(['oauth_client_secret']);
        });

        it('should return an error for app config with no app link', () => {
            const maybeError = configService.validateProviderConfig('APP', {
                display_name: null,
                unique_key: 'abc123',
                provider: 'provider',
                oauth_client_id: 'id',
                oauth_client_secret: 'secret',
                app_link: '',
                environment_id: 1,
                created_at: new Date(),
                updated_at: new Date(),
                missing_fields: [],
                forward_webhooks: true,
                shared_credentials_id: null
            });

            expect(maybeError).toEqual(['app_link']);
        });

        it('should return an error for a custom config with no app_id or private key', () => {
            const maybeError = configService.validateProviderConfig('CUSTOM', {
                display_name: null,
                unique_key: 'abc123',
                provider: 'provider',
                oauth_client_id: 'id',
                oauth_client_secret: 'secret',
                app_link: 'https://github.com/some/app',
                environment_id: 1,
                created_at: new Date(),
                updated_at: new Date(),
                missing_fields: [],
                custom: {
                    app_id: '',
                    private_key: ''
                },
                forward_webhooks: true,
                shared_credentials_id: null
            });

            expect(maybeError).toEqual(['app_id', 'private_key']);
        });
    });
});
