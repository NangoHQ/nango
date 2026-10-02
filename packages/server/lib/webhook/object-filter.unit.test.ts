import { describe, expect, it } from 'vitest';

import { evaluateObjectFilter } from './object-filter.js';

import type { WebhookConnection } from './dispatch.js';

const filter = { path: 'id.object_id', enforce: true, metadataKeyAliases: { contacts: 'attioPeopleObjectId' } };
const payload = { id: { workspace_id: 'workspace-1', object_id: 'people-object' } };

function connection(metadata: Record<string, unknown> | null): WebhookConnection {
    return { id: 11, connection_id: 'conn-1', metadata } as unknown as WebhookConnection;
}

describe('evaluateObjectFilter', () => {
    it.each([
        ['matched', { 'nango:webhookObjectId:people': 'people-object' }, 'people', payload],
        ['skipped', { 'nango:webhookObjectId:people': 'companies-object' }, 'people', payload],
        ['no_metadata', null, 'people', payload],
        ['no_metadata', {}, 'people', payload],
        ['no_sync_mapping', { 'nango:webhookObjectId:companies': 'companies-object' }, 'people', payload],
        ['no_sync_mapping', { 'nango:webhookObjectId:people': '' }, 'people', payload],
        ['no_sync_mapping', { 'nango:webhookObjectId:people': { id: 'people-object' } }, 'people', payload],
        ['no_payload_value', { 'nango:webhookObjectId:people': 'people-object' }, 'people', { id: { workspace_id: 'workspace-1' } }],
        ['no_payload_value', { 'nango:webhookObjectId:people': 'people-object' }, 'people', { id: { object_id: { nested: true } } }]
    ])('returns %s for metadata %j and sync %s', (expected, metadata, syncName, eventPayload) => {
        expect(evaluateObjectFilter({ filter, syncName, connection: connection(metadata), payload: eventPayload })).toBe(expected);
    });

    it('reads the aliased key when the documented key is absent', () => {
        expect(evaluateObjectFilter({ filter, syncName: 'contacts', connection: connection({ attioPeopleObjectId: 'people-object' }), payload })).toBe(
            'matched'
        );
        expect(evaluateObjectFilter({ filter, syncName: 'contacts', connection: connection({ attioPeopleObjectId: 'other-object' }), payload })).toBe(
            'skipped'
        );
    });

    it('prefers the documented key over the alias', () => {
        const metadata = { 'nango:webhookObjectId:contacts': 'people-object', attioPeopleObjectId: 'stale-object' };
        expect(evaluateObjectFilter({ filter, syncName: 'contacts', connection: connection(metadata), payload })).toBe('matched');
    });

    it('does not apply an alias to another sync name', () => {
        expect(evaluateObjectFilter({ filter, syncName: 'companies', connection: connection({ attioPeopleObjectId: 'other-object' }), payload })).toBe(
            'no_sync_mapping'
        );
    });

    it('falls open when the connection has no metadata field', () => {
        const internalConnection = { id: 11, connection_id: 'conn-1' } as unknown as WebhookConnection;
        expect(evaluateObjectFilter({ filter, syncName: 'people', connection: internalConnection, payload })).toBe('no_metadata');
    });
});
