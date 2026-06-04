import { describe, expect, it } from 'vitest';

import { validateIntegrationConfig } from './integrationConfig.js';

import type { Provider, SimplifiedJSONSchema } from '@nangohq/types';

function field(partial: Partial<SimplifiedJSONSchema>): SimplifiedJSONSchema {
    return { type: 'string', title: partial.title ?? 'Field', description: '', order: 1, automated: false, ...partial };
}

const provider = {
    auth_mode: 'API_KEY',
    display_name: 'Private API (Generic)',
    docs: '',
    integration_config: {
        keyPlacement: field({ title: 'Key placement', enum: ['header', 'query'], default_value: 'header' }),
        keyName: field({ title: 'Key name' }),
        valueTemplate: field({ title: 'Value template', default_value: '${apiKey}' }),
        baseUrl: field({ title: 'Base URL', format: 'uri' }),
        keyLabel: field({ title: 'API key label', optional: true, default_value: 'API Key' })
    }
} as unknown as Provider;

describe('validateIntegrationConfig', () => {
    it('applies defaults and accepts a valid config', () => {
        const result = validateIntegrationConfig(provider, { keyName: 'Authorization', baseUrl: 'https://api.example.com' });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toEqual({
                keyPlacement: 'header',
                keyName: 'Authorization',
                valueTemplate: '${apiKey}',
                baseUrl: 'https://api.example.com',
                keyLabel: 'API Key'
            });
        }
    });

    it('reports required fields that are missing', () => {
        const result = validateIntegrationConfig(provider, { baseUrl: 'https://api.example.com' });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.fields.map((e) => e.field)).toContain('keyName');
        }
    });

    it('rejects an enum value outside the allowed set', () => {
        const result = validateIntegrationConfig(provider, { keyName: 'Authorization', keyPlacement: 'body', baseUrl: 'https://api.example.com' });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.fields.map((e) => e.field)).toContain('keyPlacement');
        }
    });

    it('rejects an invalid URL for uri-format fields', () => {
        const result = validateIntegrationConfig(provider, { keyName: 'Authorization', baseUrl: 'not-a-url' });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.fields.map((e) => e.field)).toContain('baseUrl');
        }
    });

    it('drops unknown keys not present in the schema', () => {
        const result = validateIntegrationConfig(provider, { keyName: 'Authorization', baseUrl: 'https://api.example.com', somethingElse: 'x' });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).not.toHaveProperty('somethingElse');
        }
    });

    it('rejects non-http(s) URI schemes', () => {
        for (const baseUrl of ['mailto:foo@example.com', 'file:///etc/passwd', 'ftp://example.com']) {
            const result = validateIntegrationConfig(provider, { keyName: 'Authorization', baseUrl });
            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.fields.map((e) => e.field)).toContain('baseUrl');
            }
        }
    });

    it('accepts http and https URIs', () => {
        for (const baseUrl of ['http://internal.example.com', 'https://api.example.com']) {
            expect(validateIntegrationConfig(provider, { keyName: 'Authorization', baseUrl }).isOk()).toBe(true);
        }
    });

    it('rejects integrationConfig for a provider that does not declare integration_config', () => {
        const plainProvider = { auth_mode: 'API_KEY', display_name: 'Plain', docs: '' } as unknown as Provider;
        const result = validateIntegrationConfig(plainProvider, { anything: 'x' });
        expect(result.isErr()).toBe(true);
    });

    describe('patch mode', () => {
        it('validates only the submitted field and ignores missing required fields', () => {
            const result = validateIntegrationConfig(provider, { keyName: 'X-Api-Key' }, { patch: true });
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({ keyName: 'X-Api-Key' });
            }
        });

        it('still validates a submitted enum field', () => {
            const result = validateIntegrationConfig(provider, { keyPlacement: 'body' }, { patch: true });
            expect(result.isErr()).toBe(true);
        });

        it('rejects clearing a required field', () => {
            const result = validateIntegrationConfig(provider, { keyName: '' }, { patch: true });
            expect(result.isErr()).toBe(true);
        });

        it('allows clearing an optional field', () => {
            const result = validateIntegrationConfig(provider, { keyLabel: '' }, { patch: true });
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({ keyLabel: '' });
            }
        });
    });
});
