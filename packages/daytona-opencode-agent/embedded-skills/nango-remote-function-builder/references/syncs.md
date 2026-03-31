# Syncs Reference

## Contents
- Required planning output
- Schema and casing rules
- Base template
- Pattern 1: `updated_at` / `modified_since`
- Pattern 2: changed-records feed with a cursor
- Pattern 3: `since_id` / sequence checkpoint
- Pattern 4: timestamp plus page token
- Pattern 5: timestamp plus page number or offset
- Delete strategies
- Full refresh fallback
- Dryrun examples
- Invalid patterns

## Required planning output

Before writing a sync, state:
- change source: `updated_at`, `modified_since`, changed-records endpoint, cursor, page token, offset/page, `since_id`, or webhook
- checkpoint schema
- how the checkpoint changes the request or resume state
- delete strategy
- if full refresh is required, the exact provider limitation blocking checkpoints

Webhook note: `onWebhook` handlers usually do not checkpoint. If the sync also polls, still choose a checkpoint pattern for `exec`.

## Schema and casing rules

- Raw provider schemas should match the provider: `.optional()` for omitted fields, `.nullable()` for explicit `null`, `.nullish()` only when the provider truly does both.
- Normalized models should prefer `.optional()` and normalize upstream `null` to omission unless `null` matters.
- Passthrough fields keep provider casing. Derived fields should follow the majority casing of that API.
- Prefer `.nullable()` over `z.union([z.null(), T])` or `z.union([T, z.null()])`.

```typescript
const ProviderRecordSchema = z.object({
    id: z.string(),
    name: z.string().nullable(),
    updated_at: z.string(),
    archived_at: z.string().optional()
});

const RecordSchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    updated_at: z.string(),
    archived_at: z.string().optional()
});
```

## Base template

```typescript
import { createSync } from 'nango';
import { z } from 'zod';

const RecordSchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    updated_at: z.string()
});

const CheckpointSchema = z.object({
    updated_after: z.string().optional()
});

const sync = createSync({
    description: 'Brief single sentence',
    version: '1.0.0',
    frequency: 'every 5 minutes',
    autoStart: true,
    checkpoint: CheckpointSchema,
    models: {
        Record: RecordSchema
    },

    exec: async (nango) => {
        const checkpoint = await nango.getCheckpoint<z.infer<typeof CheckpointSchema>>();
        // Use checkpoint values in request params or resume state.
    }
});

export type NangoSyncLocal = Parameters<(typeof sync)['exec']>[0];
export default sync;
```

## Pattern 1: `updated_at` / `modified_since`

Use this when the provider can filter records changed since a timestamp.

```typescript
const CheckpointSchema = z.object({
    updated_after: z.string().optional()
});

const sync = createSync({
    frequency: 'every 5 minutes',
    checkpoint: CheckpointSchema,
    models: {
        Contact: RecordSchema
    },

    exec: async (nango) => {
        const checkpoint = await nango.getCheckpoint<z.infer<typeof CheckpointSchema>>();

        const proxyConfig = {
            // https://api-docs-url
            endpoint: '/v1/contacts',
            params: {
                sort: 'updated_at:asc',
                ...(checkpoint?.updated_after && { updated_after: checkpoint.updated_after })
            },
            paginate: { limit: 100 },
            retries: 3
        };

        for await (const page of nango.paginate(proxyConfig)) {
            const contacts = page.map((record: { id: string; name?: string | null; updated_at: string }) => ({
                id: record.id,
                ...(record.name != null && { name: record.name }),
                updated_at: record.updated_at
            }));

            if (contacts.length === 0) {
                continue;
            }

            await nango.batchSave(contacts, 'Contact');
            await nango.saveCheckpoint({
                updated_after: contacts[contacts.length - 1].updated_at
            });
        }
    }
});
```

If the provider exposes a deleted-record endpoint, use the same checkpoint value there.

```typescript
if (checkpoint?.updated_after) {
    const deleted = await nango.get({
        // https://api-docs-url
        endpoint: '/v1/contacts/deleted',
        params: {
            updated_after: checkpoint.updated_after
        },
        retries: 3
    });

    if (deleted.data.items.length > 0) {
        await nango.batchDelete(
            deleted.data.items.map((record: { id: string }) => ({ id: record.id })),
            'Contact'
        );
    }
}
```

## Pattern 2: changed-records feed with a cursor

Use this when the provider exposes a delta endpoint such as `/changes`, `/events`, or `/feed` and returns a cursor or token for the next page.

```typescript
const CheckpointSchema = z.object({
    cursor: z.string().optional()
});

type Change = {
    id: string;
    name?: string | null;
    updated_at?: string;
    deleted_at?: string;
};

const sync = createSync({
    frequency: 'every 5 minutes',
    checkpoint: CheckpointSchema,
    models: {
        Contact: RecordSchema
    },

    exec: async (nango) => {
        const checkpoint = await nango.getCheckpoint<z.infer<typeof CheckpointSchema>>();
        let cursor = checkpoint?.cursor;

        const proxyConfig = {
            // https://api-docs-url
            endpoint: '/v1/contacts/changes',
            params: {
                ...(cursor && { cursor })
            },
            paginate: {
                type: 'cursor',
                cursor_name_in_request: 'cursor',
                cursor_path_in_response: 'next_cursor',
                response_path: 'items',
                on_page: async ({ nextPageParam, response }) => {
                    cursor = (response.data.cursor as string | undefined) ?? (typeof nextPageParam === 'string' ? nextPageParam : undefined);
                }
            },
            retries: 3
        };

        for await (const changes of nango.paginate<Change>(proxyConfig)) {

            const upserts = changes
                .filter((change) => !change.deleted_at)
                .map((change) => ({
                    id: change.id,
                    ...(change.name != null && { name: change.name }),
                    updated_at: change.updated_at ?? new Date().toISOString()
                }));

            const deletions = changes
                .filter((change) => Boolean(change.deleted_at))
                .map((change) => ({ id: change.id }));

            if (upserts.length > 0) {
                await nango.batchSave(upserts, 'Contact');
            }

            if (deletions.length > 0) {
                await nango.batchDelete(deletions, 'Contact');
            }

            if (cursor !== undefined) {
                await nango.saveCheckpoint({ cursor });
            }
        }
    }
});
```

If the provider returns a dedicated resume token or high-water mark instead of reusing `next_cursor`, save that field instead.

## Pattern 3: `since_id` / sequence checkpoint

Use this only when the provider guarantees a monotonic identifier or event sequence and supports filtering newer records with `since_id`, `after_id`, or an equivalent parameter.

```typescript
const CheckpointSchema = z.object({
    last_id: z.string().optional()
});

const sync = createSync({
    frequency: 'every 5 minutes',
    checkpoint: CheckpointSchema,
    models: {
        Invoice: RecordSchema
    },

    exec: async (nango) => {
        const checkpoint = await nango.getCheckpoint<z.infer<typeof CheckpointSchema>>();

        const proxyConfig = {
            // https://api-docs-url
            endpoint: '/v1/invoices',
            params: {
                sort: 'id:asc',
                ...(checkpoint?.last_id && { since_id: checkpoint.last_id })
            },
            paginate: { limit: 100 },
            retries: 3
        };

        for await (const page of nango.paginate(proxyConfig)) {
            const invoices = page.map((record: { id: string; name?: string | null; updated_at: string }) => ({
                id: record.id,
                ...(record.name != null && { name: record.name }),
                updated_at: record.updated_at
            }));

            if (invoices.length === 0) {
                continue;
            }

            await nango.batchSave(invoices, 'Invoice');
            await nango.saveCheckpoint({
                last_id: invoices[invoices.length - 1].id
            });
        }
    }
});
```

## Pattern 4: timestamp plus page token

Use a composite checkpoint when the provider filters by time but also requires a page token or cursor to resume safely within the same window.

```typescript
const CheckpointSchema = z.object({
    updated_after: z.string().optional(),
    page_token: z.string().optional()
});

const sync = createSync({
    frequency: 'every 5 minutes',
    checkpoint: CheckpointSchema,
    models: {
        Task: RecordSchema
    },

    exec: async (nango) => {
        const checkpoint = await nango.getCheckpoint<z.infer<typeof CheckpointSchema>>();
        let updatedAfter = checkpoint?.updated_after;
        let pageToken = checkpoint?.page_token;

        const proxyConfig = {
            // https://api-docs-url
            endpoint: '/v1/tasks',
            params: {
                sort: 'updated_at:asc',
                ...(updatedAfter && { updated_after: updatedAfter }),
                ...(pageToken && { page_token: pageToken })
            },
            paginate: {
                type: 'cursor',
                cursor_name_in_request: 'page_token',
                cursor_path_in_response: 'next_page_token',
                response_path: 'items',
                limit_name_in_request: 'limit',
                limit: 100,
                on_page: async ({ nextPageParam }) => {
                    pageToken = typeof nextPageParam === 'string' ? nextPageParam : undefined;
                }
            },
            retries: 3
        };

        for await (const page of nango.paginate<{ id: string; name?: string | null; updated_at: string }>(proxyConfig)) {
            const tasks = page.map((record) => ({
                id: record.id,
                ...(record.name != null && { name: record.name }),
                updated_at: record.updated_at
            }));

            if (tasks.length === 0) {
                continue;
            }

            await nango.batchSave(tasks, 'Task');

            if (pageToken) {
                await nango.saveCheckpoint({
                    ...(updatedAfter && { updated_after: updatedAfter }),
                    page_token: pageToken
                });
                continue;
            }

            updatedAfter = tasks[tasks.length - 1].updated_at;
            await nango.saveCheckpoint({ updated_after: updatedAfter });
        }
    }
});
```

Use this same pattern when the provider can return identical timestamps and you need extra pagination state to avoid skipping or replaying records.

## Pattern 5: timestamp plus page number or offset

Use a composite checkpoint when the provider filters by time but paginates with `page`, `offset`, or `start` instead of a token.

```typescript
const CheckpointSchema = z.object({
    updated_after: z.string().optional(),
    page: z.number().int().positive().optional()
});

const sync = createSync({
    frequency: 'every 5 minutes',
    checkpoint: CheckpointSchema,
    models: {
        Lead: RecordSchema
    },

    exec: async (nango) => {
        const checkpoint = await nango.getCheckpoint<z.infer<typeof CheckpointSchema>>();
        let updatedAfter = checkpoint?.updated_after;
        let page: number | undefined = checkpoint?.page ?? 1;
        let lastProcessedUpdatedAt: string | undefined;

        const proxyConfig = {
            // https://api-docs-url
            endpoint: '/v1/leads',
            params: {
                sort: 'updated_at:asc',
                ...(updatedAfter && { modified_since: updatedAfter })
            },
            paginate: {
                type: 'offset',
                offset_name_in_request: 'page',
                offset_start_value: page ?? 1,
                offset_calculation_method: 'per-page',
                limit_name_in_request: 'per_page',
                limit: 100,
                response_path: 'items',
                on_page: async ({ nextPageParam }) => {
                    page = typeof nextPageParam === 'number' ? nextPageParam : undefined;
                }
            },
            retries: 3
        };

        for await (const pageResults of nango.paginate<{ id: string; name?: string | null; updated_at: string }>(proxyConfig)) {
            const leads = pageResults.map((record) => ({
                id: record.id,
                ...(record.name != null && { name: record.name }),
                updated_at: record.updated_at
            }));

            if (leads.length === 0) {
                if (page === undefined && lastProcessedUpdatedAt) {
                    await nango.saveCheckpoint({
                        updated_after: lastProcessedUpdatedAt,
                        page: 1
                    });
                }
                continue;
            }

            await nango.batchSave(leads, 'Lead');
            lastProcessedUpdatedAt = leads[leads.length - 1].updated_at;

            if (page !== undefined) {
                await nango.saveCheckpoint({
                    ...(updatedAfter && { updated_after: updatedAfter }),
                    page
                });
                continue;
            }

            updatedAfter = lastProcessedUpdatedAt;
            await nango.saveCheckpoint({
                updated_after: updatedAfter,
                page: 1
            });
        }
    }
});
```

## Delete strategies

Incremental syncs should usually delete with explicit provider data, not full refresh deletion detection.

Deleted-record endpoint:

```typescript
const deleted = await nango.get({
    // https://api-docs-url
    endpoint: '/v1/tasks/deleted',
    params: {
        ...(checkpoint?.updated_after && { updated_after: checkpoint.updated_after })
    },
    retries: 3
});

if (deleted.data.items.length > 0) {
    await nango.batchDelete(
        deleted.data.items.map((record: { id: string }) => ({ id: record.id })),
        'Task'
    );
}
```

Deleted flag in the change feed:

```typescript
const deletions = changes
    .filter((change) => Boolean(change.deleted_at))
    .map((change) => ({ id: change.id }));

if (deletions.length > 0) {
    await nango.batchDelete(deletions, 'Task');
}
```

## Full refresh fallback

Use full refresh only when the provider truly cannot return changes, deletions, or resumable state. State the blocker explicitly before using this pattern.

Never reuse this pattern on a changed-only endpoint (`modified_after`, `updated_after`, changed-records feed, etc.). Those endpoints omit unchanged rows, so `trackDeletesEnd()` would treat unchanged records as deleted.

```typescript
const sync = createSync({
    frequency: 'every hour',
    models: {
        Record: RecordSchema
    },

    exec: async (nango) => {
        // Blocker: provider only exposes /v1/records with no changed-since filter,
        // no deleted-record endpoint, and no resumable cursor.
        await nango.trackDeletesStart('Record');

        const proxyConfig = {
            // https://api-docs-url
            endpoint: '/v1/records',
            paginate: { limit: 100 },
            retries: 3
        };

        for await (const page of nango.paginate(proxyConfig)) {
            const records = page.map((record: { id: string; name?: string | null; updated_at: string }) => ({
                id: record.id,
                ...(record.name != null && { name: record.name }),
                updated_at: record.updated_at
            }));

            if (records.length > 0) {
                await nango.batchSave(records, 'Record');
            }
        }

        await nango.trackDeletesEnd('Record');
    }
});
```

## Dryrun examples

Validate a sync:

```bash
nango dryrun <sync-name> <connection-id> --validate -e dev --no-interactive --auto-confirm
```

Validate a resumed sync with a checkpoint:

```bash
nango dryrun <sync-name> <connection-id> --validate -e dev --no-interactive --auto-confirm --checkpoint '{"updated_after":"2024-01-15T00:00:00Z"}'
```

Validate a cursor-based sync with a checkpoint:

```bash
nango dryrun <sync-name> <connection-id> --validate -e dev --no-interactive --auto-confirm --checkpoint '{"cursor":"eyJwYWdlIjoyfQ=="}'
```

Record mocks after validation passes:

```bash
nango dryrun <sync-name> <connection-id> --save -e dev --no-interactive --auto-confirm
```

Stub metadata when needed:

```bash
nango dryrun <sync-name> <connection-id> --validate -e dev --no-interactive --auto-confirm --metadata @fixtures/metadata.json
```

## Invalid patterns

Bad example: the checkpoint is read and saved, but it never changes the provider request.

```typescript
const checkpoint = await nango.getCheckpoint<{ updated_after?: string }>();

const response = await nango.get({
    endpoint: '/v1/contacts',
    retries: 3
});

await nango.batchSave(response.data.items, 'Contact');
await nango.saveCheckpoint({
    updated_after: new Date().toISOString()
});
```

Why this is invalid:
- the next run still fetches the full dataset
- failures cannot resume from the saved state
- delete handling is disconnected from the saved progress

The checkpoint must change the request or resume state.

Bad example: a changed-only checkpoint is combined with `trackDeletesStart()` / `trackDeletesEnd()`.

```typescript
const checkpoint = await nango.getCheckpoint<{ modified_after?: string }>();

await nango.trackDeletesStart('Contact');

const response = await nango.get({
    endpoint: '/v1/contacts',
    params: checkpoint?.modified_after ? { modified_after: checkpoint.modified_after } : {},
    retries: 3
});

await nango.batchSave(response.data.items, 'Contact');
await nango.saveCheckpoint({
    modified_after: new Date().toISOString()
});
await nango.trackDeletesEnd('Contact');
```

Why this is invalid:
- the endpoint returns only changed contacts
- unchanged contacts are absent from this execution
- `trackDeletesEnd()` will delete those unchanged contacts as if they disappeared at the provider
