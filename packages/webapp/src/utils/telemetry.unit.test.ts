import { describe, expect, it } from 'vitest';

import { redactConnectionIdFromUrl } from './telemetry.js';

describe('redactConnectionIdFromUrl', () => {
    it('redacts the connection id segment on the connection detail page', () => {
        expect(redactConnectionIdFromUrl('https://app.nango.dev/dev/connections/salesforce/patient@example.com')).toBe(
            'https://app.nango.dev/dev/connections/salesforce/__redacted__'
        );
    });

    it('keeps sub-routes after the connection id', () => {
        expect(redactConnectionIdFromUrl('https://app.nango.dev/prod/connections/hubspot/1f9a2b3c/records/Contact')).toBe(
            'https://app.nango.dev/prod/connections/hubspot/__redacted__/records/Contact'
        );
    });

    it('leaves the connections list and create pages untouched', () => {
        expect(redactConnectionIdFromUrl('https://app.nango.dev/dev/connections')).toBe('https://app.nango.dev/dev/connections');
        expect(redactConnectionIdFromUrl('https://app.nango.dev/dev/connections/create?integration_id=slack')).toBe(
            'https://app.nango.dev/dev/connections/create?integration_id=slack'
        );
        expect(redactConnectionIdFromUrl('https://app.nango.dev/dev/connections/create/salesforce')).toBe(
            'https://app.nango.dev/dev/connections/create/salesforce'
        );
        expect(redactConnectionIdFromUrl('https://app.nango.dev/dev/connections/create-legacy/slack')).toBe(
            'https://app.nango.dev/dev/connections/create-legacy/slack'
        );
    });

    it('redacts the connection id in API urls', () => {
        expect(redactConnectionIdFromUrl('http://localhost:3003/api/v1/connections/patient@example.com?env=dev&provider_config_key=salesforce')).toBe(
            'http://localhost:3003/api/v1/connections/__redacted__?env=dev&provider_config_key=salesforce'
        );
        expect(redactConnectionIdFromUrl('http://localhost:3003/api/v1/connections/1f9a2b3c/records/models?env=dev')).toBe(
            'http://localhost:3003/api/v1/connections/__redacted__/records/models?env=dev'
        );
    });

    it('leaves API count and admin endpoints untouched', () => {
        expect(redactConnectionIdFromUrl('http://localhost:3003/api/v1/connections/count?env=dev')).toBe(
            'http://localhost:3003/api/v1/connections/count?env=dev'
        );
        expect(redactConnectionIdFromUrl('http://localhost:3003/api/v1/connections/count')).toBe('http://localhost:3003/api/v1/connections/count');
        expect(redactConnectionIdFromUrl('http://localhost:3003/api/v1/connections/admin/account-uuid-1?env=dev')).toBe(
            'http://localhost:3003/api/v1/connections/admin/account-uuid-1?env=dev'
        );
    });

    it('redacts connection id query params', () => {
        expect(redactConnectionIdFromUrl('https://app.nango.dev/dev/logs?connection_id=patient@example.com&day=1')).toBe(
            'https://app.nango.dev/dev/logs?connection_id=__redacted__&day=1'
        );
        expect(redactConnectionIdFromUrl('https://api.nango.dev/api/v1/foo?env=dev&connectionId=abc%40x.com')).toBe(
            'https://api.nango.dev/api/v1/foo?env=dev&connectionId=__redacted__'
        );
    });

    it('leaves unrelated urls untouched', () => {
        expect(redactConnectionIdFromUrl('https://app.nango.dev/dev/integrations/salesforce')).toBe('https://app.nango.dev/dev/integrations/salesforce');
    });
});
