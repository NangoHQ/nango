import { describe, expect, it } from 'vitest';

import { evaluateObjectFilter } from './object-filter.js';

import type { WebhookConnection } from './dispatch.js';

const filter = { path: 'id.object_id', metadataKeyBySyncName: { contacts: 'peopleObjectId' } };
const payload = { id: { workspace_id: 'workspace-1', object_id: 'people-object' } };

function connection(metadata: Record<string, unknown> | null): WebhookConnection {
    return { id: 11, connection_id: 'conn-1', metadata } as unknown as WebhookConnection;
}

describe('evaluateObjectFilter', () => {
    it.each([
        ['matched', { peopleObjectId: 'people-object' }, 'contacts', payload],
        ['skipped', { peopleObjectId: 'companies-object' }, 'contacts', payload],
        ['no_sync_mapping', { peopleObjectId: 'companies-object' }, 'deals', payload],
        ['no_metadata', null, 'contacts', payload],
        ['no_metadata', { companiesObjectId: 'companies-object' }, 'contacts', payload],
        ['no_metadata', { peopleObjectId: '' }, 'contacts', payload],
        ['no_metadata', { peopleObjectId: { id: 'people-object' } }, 'contacts', payload],
        ['no_payload_value', { peopleObjectId: 'people-object' }, 'contacts', { id: { workspace_id: 'workspace-1' } }],
        ['no_payload_value', { peopleObjectId: 'people-object' }, 'contacts', { id: { object_id: { nested: true } } }]
    ])('returns %s for metadata %j and sync %s', (expected, metadata, syncName, eventPayload) => {
        expect(evaluateObjectFilter({ filter, syncName, connection: connection(metadata), payload: eventPayload })).toBe(expected);
    });

    it('falls open when the connection has no metadata field', () => {
        const internalConnection = { id: 11, connection_id: 'conn-1' } as unknown as WebhookConnection;
        expect(evaluateObjectFilter({ filter, syncName: 'contacts', connection: internalConnection, payload })).toBe('no_metadata');
    });
});
