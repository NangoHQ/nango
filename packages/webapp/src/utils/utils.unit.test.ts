import { describe, expect, it } from 'vitest';

import { formatKeyToLabel } from './utils.js';

describe('utils', () => {
    describe('formatKeyToLabel', () => {
        it('should format snake_case to label', () => {
            expect(formatKeyToLabel('api_key')).toBe('Api key');
            expect(formatKeyToLabel('client_secret')).toBe('Client secret');
            expect(formatKeyToLabel('access_token')).toBe('Access token');
        });

        it('should format camelCase to label', () => {
            expect(formatKeyToLabel('apiKey')).toBe('Api key');
            expect(formatKeyToLabel('clientSecret')).toBe('Client secret');
            expect(formatKeyToLabel('accessToken')).toBe('Access token');
        });

        it('should format PascalCase to label', () => {
            expect(formatKeyToLabel('ApiKey')).toBe('Api key');
            expect(formatKeyToLabel('ClientSecret')).toBe('Client secret');
            expect(formatKeyToLabel('AccessToken')).toBe('Access token');
        });

        it('should format single word to capitalized label', () => {
            expect(formatKeyToLabel('api')).toBe('Api');
            expect(formatKeyToLabel('key')).toBe('Key');
            expect(formatKeyToLabel('token')).toBe('Token');
        });

        it('should handle multiple underscores', () => {
            expect(formatKeyToLabel('api_key_secret')).toBe('Api key secret');
            expect(formatKeyToLabel('client_id_secret_key')).toBe('Client id secret key');
        });

        it('should handle mixed case with underscores', () => {
            expect(formatKeyToLabel('apiKeySecret')).toBe('Api key secret');
            expect(formatKeyToLabel('clientIdSecret')).toBe('Client id secret');
        });

        it('should handle consecutive underscores', () => {
            expect(formatKeyToLabel('api__key')).toBe('Api key');
            expect(formatKeyToLabel('client___secret')).toBe('Client secret');
        });

        it('should handle all uppercase', () => {
            expect(formatKeyToLabel('API_KEY')).toBe('Api key');
            expect(formatKeyToLabel('CLIENT_SECRET')).toBe('Client secret');
        });

        it('should handle keys with numbers', () => {
            expect(formatKeyToLabel('apiKey2')).toBe('Api key2');
            expect(formatKeyToLabel('client_id_123')).toBe('Client id 123');
            expect(formatKeyToLabel('v2ApiKey')).toBe('V2api key');
        });

        it('should handle already formatted strings', () => {
            expect(formatKeyToLabel('Api key')).toBe('Api key');
            expect(formatKeyToLabel('Client secret')).toBe('Client secret');
        });

        it('should handle complex mixed cases', () => {
            expect(formatKeyToLabel('OAuth2ClientCredentials')).toBe('Oauth2client credentials');
            expect(formatKeyToLabel('XMLHttpRequest')).toBe('Xmlhttp request');
            expect(formatKeyToLabel('getUserById')).toBe('Get user by id');
        });

        it('should handle keys starting with underscore', () => {
            expect(formatKeyToLabel('_api_key')).toBe('Api key');
            expect(formatKeyToLabel('_privateKey')).toBe('Private key');
        });

        it('should handle keys ending with underscore', () => {
            expect(formatKeyToLabel('api_key_')).toBe('Api key');
            expect(formatKeyToLabel('clientSecret_')).toBe('Client secret');
        });
    });
});
