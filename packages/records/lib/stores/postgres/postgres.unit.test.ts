import knex from 'knex';
import { describe, expect, it } from 'vitest';

import { getRecordsToDeleteSizes } from './postgres.js';

const trx = knex({ client: 'pg' });

describe('getRecordsToDeleteSizes', () => {
    it('should look up records_data with a lateral join on literal connection and model values', () => {
        const query = getRecordsToDeleteSizes(trx, {
            connectionId: 664,
            model: 'StandardSchedule',
            mode: 'hard',
            limit: 1000,
            from: null,
            toCursorIncluded: null
        }).toQuery();

        expect(query).toBe(
            'select "r"."id", COALESCE(pg_column_size(r.json), r.size_bytes, pg_column_size(d.data), 0) as size_bytes' +
                ' from (select "id", "json", "size_bytes" from "records" where "connection_id" = 664 and "model" = \'StandardSchedule\' order by "updated_at" asc, "id" asc limit 1000) as "r"' +
                ' LEFT JOIN LATERAL (SELECT data FROM "records_data" AS d WHERE d.connection_id = 664 AND d.model = \'StandardSchedule\' AND d.id = r.id) AS d ON true'
        );
    });

    it('should apply the batch cursors and mode filter to the records it sizes', () => {
        const query = getRecordsToDeleteSizes(trx, {
            connectionId: 664,
            model: 'StandardSchedule',
            mode: 'prune',
            limit: 1000,
            from: { updated_at: '2026-11-01T00:00:00.000Z', id: 'a' },
            toCursorIncluded: { sort: '2026-11-02T00:00:00.000Z', id: 'z' }
        }).toQuery();

        expect(query).toContain(`(updated_at, id) > ('2026-11-01T00:00:00.000Z', 'a')`);
        expect(query).toContain(`(updated_at, id) <= ('2026-11-02T00:00:00.000Z', 'z')`);
        expect(query).toContain('"pruned_at" is null');
    });
});
