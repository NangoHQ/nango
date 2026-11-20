import { randomBytes } from 'node:crypto';

import knex from 'knex';
import * as uuid from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RECORD_COUNTS_TABLE, RECORDS_TABLE } from '../../constants.js';
import { envs } from '../../env.js';
import { formatRecords } from '../../helpers/format.js';
import { encryptRecords } from '../../utils/encryption.js';
import { makePostgresConfig } from './config.js';
import { PostgresStore } from './postgres.js';

import type { UnencryptedRecordData } from '../../types.js';
import type { Knex } from 'knex';

/**
 * Default getRecords must not materialize an entire caller-chosen page of
 * record documents. The public records route accepts limit 10000 and persist
 * accepts any positive limit; both call this store. The byte budget defaults
 * to 0 (disabled) and dry-run defaults to on, and the page query selects the
 * json column before any trim. These tests call the store the way those
 * routes do and fail until a default budget truncates the page before the
 * document columns are read.
 */
const MAX_DEFAULT_RESPONSE_BUDGET_BYTES = 4 * 1024 * 1024;
const RECORD_COUNT = 4;
// Random bytes, base64-encoded, so PostgreSQL cannot toast-compress the
// ciphertext under the budget. Shared across rows; each value is compressed
// on its own.
const PAYLOAD = randomBytes(900_000).toString('base64');

interface CapturedQuery {
    sql: string;
    values: unknown[];
}

type Queryable = {
    query: (config: unknown, values?: unknown, callback?: unknown) => unknown;
};

const queries: CapturedQuery[] = [];

function captureQuery(config: unknown, values: unknown): void {
    if (typeof config === 'string') {
        queries.push({ sql: config, values: Array.isArray(values) ? values : [] });
        return;
    }
    if (config && typeof config === 'object') {
        const query = config as { text?: unknown; values?: unknown; submit?: unknown };
        if (typeof query.text === 'string') {
            const bound = Array.isArray(query.values) ? query.values : Array.isArray(values) ? values : [];
            queries.push({ sql: query.text, values: bound });
        }
    }
}

function instrument(config: Knex.Config & { migrations: Knex.MigratorConfig }): Knex.Config & { migrations: Knex.MigratorConfig } {
    const pool = { ...(config.pool as object) } as {
        afterCreate?: (connection: Queryable, done: (err: Error | null, connection: Queryable) => void) => void;
    };
    const previous = pool.afterCreate;
    return {
        ...config,
        pool: {
            ...pool,
            afterCreate(connection: Queryable, done: (err: Error | null, connection: Queryable) => void) {
                const original = connection.query.bind(connection);
                connection.query = (queryConfig: unknown, queryValues?: unknown, callback?: unknown) => {
                    captureQuery(queryConfig, queryValues);
                    return original(queryConfig, queryValues, callback);
                };
                if (previous) {
                    previous(connection, done);
                    return;
                }
                done(null, connection);
            }
        }
    };
}

function selectList(sql: string): string {
    const match = /\bselect\b([\s\S]+?)\bfrom\b/i.exec(sql);
    return match?.[1] ?? '';
}

/** True when a SELECT list returns the document column, not merely its size. */
function projectsDocumentColumn(sql: string, column: 'json' | 'data'): boolean {
    let list = selectList(sql);
    if (!list) {
        return false;
    }
    if (column === 'json') {
        list = list.replace(/to_json\s*\([^)]*\)/gi, '').replace(/pg_column_size\s*\(\s*(?:[\w"]+\.)?json\s*\)/gi, '');
        return /\bjson\b/i.test(list);
    }
    return /(?:^|[\s,(])"?data"?\b/i.test(list);
}

/** The limited metadata scan of the records table, before per-row document fetches. */
function isPageQuery(sql: string): boolean {
    return /\blimit\b/i.test(sql) && /from\s+"records"/i.test(sql) && !/from\s+"records_data"/i.test(sql);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function documentIdsLoaded(captured: CapturedQuery[]): string[] {
    const ids: string[] = [];
    for (const query of captured) {
        // A page query that still projects the document is reported separately.
        // It has no per-row id bindings; the follow-up fetch is what must be trimmed.
        if (isPageQuery(query.sql) && (projectsDocumentColumn(query.sql, 'json') || projectsDocumentColumn(query.sql, 'data'))) {
            continue;
        }
        if (!projectsDocumentColumn(query.sql, 'json') && !projectsDocumentColumn(query.sql, 'data')) {
            continue;
        }
        for (const value of query.values) {
            if (typeof value === 'string' && UUID_PATTERN.test(value)) {
                ids.push(value);
            }
        }
    }
    return ids;
}

function keptCount(sizes: number[], budget: number): number {
    let acc = 0;
    let truncateAt: number | null = null;
    for (let i = 0; i < sizes.length; i++) {
        const size = sizes[i] ?? 0;
        if (truncateAt !== null) {
            continue;
        }
        if (i > 0 && acc + size > budget) {
            truncateAt = i;
            continue;
        }
        acc += size;
    }
    return truncateAt ?? sizes.length;
}

const databaseUrl = envs.RECORDS_DATABASE_URL;
if (!databaseUrl) {
    throw new Error('RECORDS_DATABASE_URL is required');
}

const testConfig = makePostgresConfig({
    databaseUrl,
    schema: envs.RECORDS_DATABASE_SCHEMA,
    statementTimeout: envs.RECORDS_DATABASE_STATEMENT_TIMEOUT_MS,
    ssl: envs.RECORDS_DATABASE_SSL,
    applicationName: 'records-budget-tests',
    pool: { min: 0, max: 4 }
});

const db = knex(testConfig);
const store = new PostgresStore(instrument(testConfig));

async function storedSizes(connectionId: number, model: string): Promise<number[]> {
    const res = await db.raw<{ rows: { size: number }[] }>(
        `SELECT COALESCE(size_bytes, pg_column_size(json), 0)::int AS size
         FROM ??
         WHERE connection_id = ? AND model = ?
         ORDER BY updated_at ASC, id ASC`,
        [RECORDS_TABLE, connectionId, model]
    );
    return res.rows.map((row) => Number(row.size));
}

describe('getRecords response budget', () => {
    beforeAll(async () => {
        await store.migrate();
    });

    afterAll(async () => {
        await db(RECORDS_TABLE).truncate();
        await db(RECORD_COUNTS_TABLE).truncate();
        await store.close();
        await db.destroy();
    });

    async function readPage(connectionId: number, model: string) {
        const sizes = await storedSizes(connectionId, model);
        queries.length = 0;
        // 10000 is the public records limit. Persist accepts any larger positive limit.
        const response = await store.getRecords({ connectionId, model, limit: 10_000 });
        expect(response.isOk()).toBe(true);
        const page = response.unwrap();
        return { sizes, page, captured: queries.slice() };
    }

    function expectTrimmedBeforeDocumentsLoad(sizes: number[], records: Record<string, unknown>[], captured: CapturedQuery[]) {
        const budget = envs.RECORDS_MAX_RESPONSE_SIZE_BYTES;
        const total = sizes.reduce((sum, size) => sum + size, 0);
        // Fixture checks are hard failures: a page that fits in any acceptable
        // budget would not exercise truncation.
        expect(total).toBeGreaterThan(MAX_DEFAULT_RESPONSE_BUDGET_BYTES);
        expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_DEFAULT_RESPONSE_BUDGET_BYTES);
        expect(sizes.every((size) => size > 0)).toBe(true);

        const loadedIds = documentIdsLoaded(captured);
        const dryRun = envs.RECORDS_MAX_RESPONSE_SIZE_DRY_RUN;
        expect.soft(dryRun, 'dry-run still returns the full page').toBe(false);
        expect.soft(budget, 'response byte budget is disabled').toBeGreaterThan(0);
        expect.soft(budget).toBeLessThanOrEqual(MAX_DEFAULT_RESPONSE_BUDGET_BYTES);

        if (budget > 0 && !dryRun) {
            const kept = keptCount(sizes, budget);
            expect(kept).toBeGreaterThan(0);
            expect(kept).toBeLessThan(sizes.length);
            expect(records.length).toBe(kept);
            expect(loadedIds.length).toBe(kept);
        } else {
            expect.soft(records.length, 'every stored document was decrypted into the page').toBeLessThan(sizes.length);
            expect.soft(loadedIds.length, 'document rows were fetched for the untrimmed page').toBeLessThan(sizes.length);
        }
        for (const record of records) {
            expect(record['payload']).toBe(PAYLOAD);
        }
        for (const query of captured) {
            if (!isPageQuery(query.sql)) {
                continue;
            }
            expect.soft(projectsDocumentColumn(query.sql, 'json'), query.sql).toBe(false);
            expect.soft(projectsDocumentColumn(query.sql, 'data'), query.sql).toBe(false);
        }
    }

    it('does not load every document for a current upsert page that exceeds the default budget', async () => {
        const connectionId = Math.floor(Math.random() * 1_000_000_000);
        const environmentId = Math.floor(Math.random() * 1_000_000_000);
        const model = `Budget${Math.random().toString(36).slice(2, 8)}`;
        const syncId = uuid.v4();
        const records: UnencryptedRecordData[] = Array.from({ length: RECORD_COUNT }, (_, i) => ({ id: String(i), payload: PAYLOAD }));
        const formatRes = formatRecords({ data: records, connectionId, model, syncId, syncJobId: 1 });
        expect(formatRes.isOk()).toBe(true);
        const upsertRes = await store.upsert({
            records: formatRes.unwrap(),
            connectionId,
            environmentId,
            model,
            softDelete: false,
            merging: { strategy: 'override' }
        });
        expect(upsertRes.isOk()).toBe(true);

        const { sizes, page, captured } = await readPage(connectionId, model);
        expectTrimmedBeforeDocumentsLoad(sizes, page.records, captured);
    }, 60_000);

    it('does not select legacy json documents for rows past the default budget', async () => {
        const connectionId = Math.floor(Math.random() * 1_000_000_000);
        const environmentId = Math.floor(Math.random() * 1_000_000_000);
        const model = `Legacy${Math.random().toString(36).slice(2, 8)}`;
        const syncId = uuid.v4();
        const records: UnencryptedRecordData[] = Array.from({ length: RECORD_COUNT }, (_, i) => ({ id: String(i), payload: PAYLOAD }));
        const formatRes = formatRecords({ data: records, connectionId, model, syncId, syncJobId: 1 });
        expect(formatRes.isOk()).toBe(true);
        const encrypted = encryptRecords(formatRes.unwrap());
        // Historical rows keep the document in records.json and have no size_bytes.
        // The read path still selects that column for the whole page.
        await db(RECORDS_TABLE).insert(
            encrypted.map((record) => ({
                id: record.id,
                connection_id: record.connection_id,
                model: record.model,
                external_id: record.external_id,
                json: record.json,
                data_hash: record.data_hash,
                sync_id: record.sync_id,
                sync_job_id: record.sync_job_id
            }))
        );
        await db(RECORD_COUNTS_TABLE).insert({
            connection_id: connectionId,
            environment_id: environmentId,
            model,
            count: encrypted.length,
            size_bytes: 0
        });

        const { sizes, page, captured } = await readPage(connectionId, model);
        expect(sizes.every((size) => size > 0)).toBe(true);
        expectTrimmedBeforeDocumentsLoad(sizes, page.records, captured);
    }, 60_000);
});
