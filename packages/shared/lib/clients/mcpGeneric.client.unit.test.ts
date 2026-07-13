import { describe, expect, it } from 'vitest';

import { chooseMcpClientIdMethod } from './mcpGeneric.client.js';

const cimdUrl = 'https://api.example.com/oauth/client-metadata/env-uuid/my-integration';

describe('chooseMcpClientIdMethod', () => {
    it('prefers CIMD when the server advertises support and a document url is available', () => {
        expect(chooseMcpClientIdMethod({ client_id_metadata_document_supported: true }, cimdUrl)).toBe('cimd');
    });

    it('prefers CIMD over DCR when both are available', () => {
        expect(
            chooseMcpClientIdMethod({ client_id_metadata_document_supported: true, registration_endpoint: 'https://mcp.example.com/register' }, cimdUrl)
        ).toBe('cimd');
    });

    it('falls back to DCR when no document url is available', () => {
        expect(chooseMcpClientIdMethod({ client_id_metadata_document_supported: true, registration_endpoint: 'https://mcp.example.com/register' }, null)).toBe(
            'dcr'
        );
    });

    it('uses DCR when the server does not advertise CIMD support', () => {
        expect(chooseMcpClientIdMethod({ registration_endpoint: 'https://mcp.example.com/register' }, cimdUrl)).toBe('dcr');
    });

    it('ignores a non-boolean-true CIMD flag', () => {
        expect(
            chooseMcpClientIdMethod({ client_id_metadata_document_supported: false, registration_endpoint: 'https://mcp.example.com/register' }, cimdUrl)
        ).toBe('dcr');
    });

    it('falls back to static when neither CIMD nor DCR is available', () => {
        expect(chooseMcpClientIdMethod({}, null)).toBe('static');
        expect(chooseMcpClientIdMethod({ client_id_metadata_document_supported: true }, null)).toBe('static');
    });
});
