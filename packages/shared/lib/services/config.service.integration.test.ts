import { beforeAll, describe, expect, it } from 'vitest';

import { multipleMigrations } from '@nangohq/database';

import { createConfigSeed, createPreprovisionedProviderConfigSeed } from '../seeders/config.seeder.js';
import { createEnvironmentSeed } from '../seeders/environment.seeder.js';
import configService from './config.service.js';
import { getProvider } from './providers.js';

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

        it('should encrypt custom secrets at rest even when oauth_client_secret is not set', async () => {
            const env = await createEnvironmentSeed();
            const provider = getProvider('aws-sigv4');
            if (!provider) {
                throw new Error('aws-sigv4 provider not found');
            }

            const created = await configService.createProviderConfig(
                {
                    unique_key: Math.random().toString(36).substring(7),
                    provider: 'aws-sigv4',
                    environment_id: env.id,
                    forward_webhooks: true,
                    custom: { service: 's3', awsSecretAccessKey: 'super-secret-value' }
                },
                provider
            );

            expect(created).not.toBeNull();
            expect(created?.custom).not.toEqual(expect.objectContaining({ awsSecretAccessKey: 'super-secret-value' }));
            expect(created?.custom).toEqual(
                expect.objectContaining({ encryptedValue: expect.any(String), iv: expect.any(String), authTag: expect.any(String) })
            );
        });
    });

    describe('getProviderConfig', () => {
        it('should resolve app_link from shared credentials when set', async () => {
            const env = await createEnvironmentSeed();

            const created = await createPreprovisionedProviderConfigSeed(env, 'github-app-shared', 'github-app', 'github-app-shared', {
                shared_credentials_app_link: 'https://github.com/apps/some-shared-app'
            });

            const resolved = await configService.getProviderConfig(created.unique_key, env.id);

            expect(resolved?.app_link).toBe('https://github.com/apps/some-shared-app');
        });

        it('should keep its own app_link when the shared row does not set one', async () => {
            const env = await createEnvironmentSeed();

            const created = await createPreprovisionedProviderConfigSeed(env, 'github-app-own-link', 'github-app', 'github-app-no-link', {
                rest: { app_link: 'https://github.com/apps/own-app' }
            });

            const resolved = await configService.getProviderConfig(created.unique_key, env.id);

            expect(resolved?.app_link).toBe('https://github.com/apps/own-app');
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
