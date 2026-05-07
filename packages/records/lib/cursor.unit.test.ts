import { describe, expect, it } from 'vitest';

import { Cursor } from './cursor.js';

describe('Cursor', () => {
    it('should decode cursors with UTC offsets', () => {
        const cursor = Cursor.new({
            last_modified_at: '2026-04-14T18:46:03.097459+00:00',
            id: '11111111-1111-4111-8111-111111111111'
        });

        expect(Cursor.from(cursor)).toStrictEqual({
            sort: '2026-04-14T18:46:03.097459+00:00',
            id: '11111111-1111-4111-8111-111111111111'
        });
    });

    it('should decode cursors with Z timestamps', () => {
        const cursor = Cursor.new({
            last_modified_at: '2026-04-14T18:46:03.097Z',
            id: '22222222-2222-4222-8222-222222222222'
        });

        expect(Cursor.from(cursor)).toStrictEqual({
            sort: '2026-04-14T18:46:03.097Z',
            id: '22222222-2222-4222-8222-222222222222'
        });
    });

    it('should reject malformed cursors', () => {
        const malformedCursor = Buffer.from('not-a-timestamp||not-a-uuid').toString('base64');

        expect(Cursor.from(malformedCursor)).toBeUndefined();
    });
});
