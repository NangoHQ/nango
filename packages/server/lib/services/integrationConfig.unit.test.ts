import { describe, expect, it } from 'vitest';

import { resolveIntegrationConfig } from './integrationConfig.js';

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

describe('resolveIntegrationConfig', () => {
    it('applies defaults and accepts a valid config', () => {
        const result = resolveIntegrationConfig(provider, { keyName: 'Authorization', baseUrl: 'https://api.example.com' });
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
        const result = resolveIntegrationConfig(provider, { baseUrl: 'https://api.example.com' });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.fields.map((e) => e.field)).toContain('keyName');
        }
    });

    it('rejects an enum value outside the allowed set', () => {
        const result = resolveIntegrationConfig(provider, { keyName: 'Authorization', keyPlacement: 'body', baseUrl: 'https://api.example.com' });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.fields.map((e) => e.field)).toContain('keyPlacement');
        }
    });

    it('rejects an invalid URL for uri-format fields', () => {
        const result = resolveIntegrationConfig(provider, { keyName: 'Authorization', baseUrl: 'not-a-url' });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.fields.map((e) => e.field)).toContain('baseUrl');
        }
    });

    it('rejects unknown keys not present in the schema', () => {
        const result = resolveIntegrationConfig(provider, { keyName: 'Authorization', baseUrl: 'https://api.example.com', somethingElse: 'x' });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.fields.map((e) => e.field)).toContain('somethingElse');
        }
    });

    it('rejects non-http(s) URI schemes', () => {
        for (const baseUrl of ['mailto:foo@example.com', 'file:///etc/passwd', 'ftp://example.com']) {
            const result = resolveIntegrationConfig(provider, { keyName: 'Authorization', baseUrl });
            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.fields.map((e) => e.field)).toContain('baseUrl');
            }
        }
    });

    it('accepts http and https URIs', () => {
        for (const baseUrl of ['http://internal.example.com', 'https://api.example.com']) {
            expect(resolveIntegrationConfig(provider, { keyName: 'Authorization', baseUrl }).isOk()).toBe(true);
        }
    });

    it('rejects integrationConfig for a provider that does not declare integration_config', () => {
        const plainProvider = { auth_mode: 'API_KEY', display_name: 'Plain', docs: '' } as unknown as Provider;
        const result = resolveIntegrationConfig(plainProvider, { anything: 'x' });
        expect(result.isErr()).toBe(true);
    });

    describe('patch mode', () => {
        it('validates only the submitted field and ignores missing required fields', () => {
            const result = resolveIntegrationConfig(provider, { keyName: 'X-Api-Key' }, { patch: true });
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({ keyName: 'X-Api-Key' });
            }
        });

        it('still validates a submitted enum field', () => {
            const result = resolveIntegrationConfig(provider, { keyPlacement: 'body' }, { patch: true });
            expect(result.isErr()).toBe(true);
        });

        it('rejects clearing a required field', () => {
            const result = resolveIntegrationConfig(provider, { keyName: '' }, { patch: true });
            expect(result.isErr()).toBe(true);
        });

        it('allows clearing an optional field', () => {
            const result = resolveIntegrationConfig(provider, { keyLabel: '' }, { patch: true });
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({ keyLabel: '' });
            }
        });
    });

    describe('visible_when', () => {
        const conditional = {
            auth_mode: 'AWS_SIGV4',
            display_name: 'Conditional',
            docs: '',
            integration_config: {
                mode: field({ title: 'Mode', enum: ['builtin', 'custom'], default_value: 'builtin' }),
                builtinKey: field({ title: 'Builtin key', visible_when: { field: 'mode', equals: 'builtin' } }),
                endpointUrl: field({ title: 'Endpoint URL', visible_when: { field: 'mode', equals: 'custom' } }),
                authType: field({ title: 'Auth type', enum: ['none', 'api_key'], default_value: 'none', visible_when: { field: 'mode', equals: 'custom' } }),
                apiKey: field({ title: 'API key', secret: 'true', visible_when: { field: 'authType', equals: 'api_key' } })
            }
        } as unknown as Provider;

        it('skips fields gated off by the active discriminator', () => {
            const result = resolveIntegrationConfig(conditional, { mode: 'builtin', builtinKey: 'AKIA' });
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({ mode: 'builtin', builtinKey: 'AKIA' });
            }
        });

        it('requires a visible field (custom mode needs the endpoint URL)', () => {
            const result = resolveIntegrationConfig(conditional, { mode: 'custom', endpointUrl: '' });
            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.fields.map((e) => e.field)).toContain('endpointUrl');
            }
        });

        it('requires a transitively-visible field (api_key auth needs the key)', () => {
            const result = resolveIntegrationConfig(conditional, { mode: 'custom', endpointUrl: 'https://sts.example.com', authType: 'api_key' });
            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.fields.map((e) => e.field)).toContain('apiKey');
            }
        });

        it('cascade: a child is hidden when its controller is itself hidden (stale value ignored)', () => {
            // mode=builtin hides authType; even though the stored authType is api_key, apiKey must not
            // be treated as visible/required — patching it is simply skipped rather than validated.
            const result = resolveIntegrationConfig(conditional, { apiKey: 'x' }, { patch: true, existing: { mode: 'builtin', authType: 'api_key' } });
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({});
            }
        });
    });
});
