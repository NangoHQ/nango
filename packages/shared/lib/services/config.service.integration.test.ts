import { expect, describe, it } from 'vitest';
import configService from './config.service';

describe('Config service integration tests', () => {
    describe('validateProviderConfig', () => {
        it('should return an error for oauth config with no client id', () => {
            const maybeError = configService.validateProviderConfig('OAUTH1', {
                unique_key: 'abc123',
                provider: 'provider',
                oauth_client_id: '',
                oauth_client_secret: 'secret',
                environment_id: 1,
                created_at: new Date(),
                updated_at: new Date()
            });

            expect(maybeError).toEqual(['oauth_client_id']);
        });

        it('should return an error for oauth config with no client secret', () => {
            const maybeError = configService.validateProviderConfig('OAUTH1', {
                unique_key: 'abc123',
                provider: 'provider',
                oauth_client_id: 'client',
                oauth_client_secret: '',
                environment_id: 1,
                created_at: new Date(),
                updated_at: new Date()
            });

            expect(maybeError).toEqual(['oauth_client_secret']);
        });

        it('should return an error for app config with no client id', () => {
            const maybeError = configService.validateProviderConfig('APP', {
                unique_key: 'abc123',
                provider: 'provider',
                oauth_client_id: '',
                oauth_client_secret: 'secret',
                app_link: 'link',
                environment_id: 1,
                created_at: new Date(),
                updated_at: new Date()
            });

            expect(maybeError).toEqual(['oauth_client_id']);
        });

        it('should return an error for app config with no client secret', () => {
            const maybeError = configService.validateProviderConfig('APP', {
                unique_key: 'abc123',
                provider: 'provider',
                oauth_client_id: 'id',
                oauth_client_secret: '',
                app_link: 'link',
                environment_id: 1,
                created_at: new Date(),
                updated_at: new Date()
            });

            expect(maybeError).toEqual(['oauth_client_secret']);
        });

        it('should return an error for app config with no app link', () => {
            const maybeError = configService.validateProviderConfig('APP', {
                unique_key: 'abc123',
                provider: 'provider',
                oauth_client_id: 'id',
                oauth_client_secret: 'secret',
                app_link: '',
                environment_id: 1,
                created_at: new Date(),
                updated_at: new Date()
            });

            expect(maybeError).toEqual(['app_link']);
        });
    });
});
