import { AUDIT_EVENTS_TABLE } from '../schema.js';

import type { Knex } from 'knex';

/**
 * Mirrors the ClickHouse table: `event` is the canonical blob and every other column is derived from it, so
 * a column cannot disagree with the record it describes.
 *
 * `occurred_at` is the exception and has to be, because Postgres refuses a generated column as a partition
 * key, and every text-to-timestamp cast is STABLE rather than IMMUTABLE so it could not be generated anyway.
 * The writer supplies it from the same parsed event.
 */
export async function up(knex: Knex, schema: string): Promise<void> {
    // The primary key is the event's own identity, which ON CONFLICT DO NOTHING turns into the redelivery
    // dedup ReplacingMergeTree gives us on ClickHouse. It carries `occurred_at` only because Postgres
    // requires the partition key in every unique constraint.
    await knex.raw(
        `
        CREATE TABLE IF NOT EXISTS ??.?? (
            event       text        NOT NULL,
            occurred_at timestamptz NOT NULL,
            id          uuid   GENERATED ALWAYS AS ((event::jsonb ->> 'id')::uuid) STORED,
            account_id  bigint GENERATED ALWAYS AS ((event::jsonb ->> 'accountId')::bigint) STORED NOT NULL,
            resource    text   GENERATED ALWAYS AS (event::jsonb ->> 'resource') STORED,
            action      text   GENERATED ALWAYS AS (event::jsonb ->> 'action') STORED,
            -- A CHECK alone would let a missing accountId through, since it evaluates to NULL and passes;
            -- ClickHouse guards the same two halves with JSONType plus a range test.
            CONSTRAINT audit_trail_events_account_id_nonnegative CHECK (account_id >= 0),
            PRIMARY KEY (id, occurred_at)
        ) PARTITION BY RANGE (occurred_at)
        `,
        [schema, AUDIT_EVENTS_TABLE]
    );

    // One index for both reads: (account_id, occurred_at, id) is the keyset cursor's exact ordering, and
    // resource/action ride along so a filter is applied on the index tuple rather than the heap. Declared
    // on the parent, which every partition inherits at creation — CONCURRENTLY is rejected on a partitioned
    // table, and pointless here since parent and partitions are empty when their index is built.
    await knex.raw(`CREATE INDEX IF NOT EXISTS ?? ON ??.?? (account_id, occurred_at, id, resource, action)`, [
        `${AUDIT_EVENTS_TABLE}_account_occurred_idx`,
        schema,
        AUDIT_EVENTS_TABLE
    ]);
}
