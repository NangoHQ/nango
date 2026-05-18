import { describe, expect, it } from 'vitest';

import { findSupportedApiKeyProvidersByBaseUrl, getGenericApiKeySupportedProviderMessage } from './genericApiKey.js';

describe('generic API key helpers', () => {
    it('should find exact static API key provider base URL matches', () => {
        const matches = findSupportedApiKeyProvidersByBaseUrl('https://api.github.com/');

        expect(matches).toContainEqual({
            providerKey: 'github-pat',
            displayName: 'Github (Personal Access Token)',
            baseUrl: 'https://api.github.com'
        });
    });

    it('should ignore unmatched private API base URLs', () => {
        expect(findSupportedApiKeyProvidersByBaseUrl('https://api.internal.example.com')).toStrictEqual([]);
    });

    it('should build a clear provider-specific integration message', () => {
        const message = getGenericApiKeySupportedProviderMessage([
            {
                providerKey: 'github-pat',
                displayName: 'Github (Personal Access Token)',
                baseUrl: 'https://api.github.com'
            }
        ]);

        expect(message).toBe(
            'Nango already supports this API through the Github (Personal Access Token) (github-pat) integration. Generic API Key is intended for private APIs or public APIs that Nango does not support yet. Use the provider-specific integration instead.'
        );
    });
});
