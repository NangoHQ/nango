# Actions Reference

## Contents
- Schema and casing rules
- Base template
- Metadata
- CRUD patterns
- List actions
- ActionError
- Dryrun examples

## Schema and casing rules

- Default non-required inputs to `.optional()`.
- If `null` means "clear this value", use `.nullable().optional()` and document it.
- Raw provider schemas should match the provider: `.optional()` for omitted fields, `.nullable()` for explicit `null`, `.nullish()` only when the provider truly does both.
- Final outputs should prefer `.optional()` and normalize upstream `null` to omission unless `null` matters.
- Passthrough fields keep provider casing. Derived fields should follow the majority casing of that API.
- Prefer `.nullable()` over `z.union([z.null(), T])` or `z.union([T, z.null()])`.

## Base template

Notes:
- `input` is required. For no-input actions, use `z.object({})`.
- Do not import `ActionError`. Throw `new nango.ActionError(payload)` from the `nango` exec param.
- Import `ProxyConfiguration` only if you annotate a variable.
- This example uses snake_case. Rename fields for camelCase APIs.

```typescript
import { z } from 'zod';
import { createAction } from 'nango';

const InputSchema = z.object({
    user_id: z.string().describe('User ID. Example: "123"'),
    // For no-input actions use: z.object({})
});

const ProviderUserSchema = z.object({
    id: z.string(),
    name: z.string().nullable()
});

const OutputSchema = z.object({
    id: z.string(),
    name: z.string().optional()
});

const action = createAction({
    description: 'Brief single sentence',
    version: '1.0.0',
    endpoint: {
        method: 'GET',
        path: '/user',
        group: 'Users'
    },
    input: InputSchema,
    output: OutputSchema,
    scopes: ['required.scope'],

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const response = await nango.get({
            // https://api-docs-url
            endpoint: '/api/v1/users',
            params: {
                user_id: input.user_id
            },
            retries: 3
        });

        if (!response.data) {
            throw new nango.ActionError({
                type: 'not_found',
                message: 'User not found',
                user_id: input.user_id
            });
        }

        const providerUser = ProviderUserSchema.parse(response.data);

        return {
            id: providerUser.id,
            ...(providerUser.name != null && { name: providerUser.name })
        };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
```

## Metadata

Use metadata when the action depends on connection-specific values.

```typescript
const MetadataSchema = z.object({
    team_id: z.string()
});

const action = createAction({
    metadata: MetadataSchema,

    exec: async (nango, input) => {
        const metadata = await nango.getMetadata<{ team_id?: string }>();
        const teamId = metadata?.team_id;

        if (!teamId) {
            throw new nango.ActionError({
                type: 'invalid_metadata',
                message: 'team_id is required in metadata.'
            });
        }
    }
});
```

## CRUD patterns

| Operation | Method | Config pattern |
|-----------|--------|----------------|
| Create | `nango.post(config)` | `data: { properties: {...} }` |
| Read | `nango.get(config)` | `endpoint: resource/${id}`, `params: {...}` |
| Update | `nango.patch(config)` | `endpoint: resource/${id}`, `data: {...}` |
| Delete | `nango.delete(config)` | `endpoint: resource/${id}` |
| List | `nango.get(config)` | `params: {...}` plus pagination |

Recommended in most configs:
- Add an API doc link comment above the provider call.
- Set `retries` intentionally. `3` is common for idempotent GET/LIST calls; avoid retries for non-idempotent writes unless the API supports idempotency.

Optional input fields pattern:

```typescript
const InputSchema = z.object({
    required_field: z.string(),
    optional_field: z.string().optional(),
    clearable_field: z.string().nullable().optional()
});

data: {
    required_field: input.required_field,
    ...(input.optional_field !== undefined && { optional_field: input.optional_field }),
    ...(input.clearable_field !== undefined && { clearable_field: input.clearable_field })
}
```

Use `!== undefined` so empty strings, `false`, and `0` are preserved.

## List actions

Expose pagination as `cursor` plus a next-cursor field in the API's majority casing. This example uses `next_cursor`; use `nextCursor` for camelCase APIs.

```typescript
const ListInput = z.object({
    cursor: z.string().optional().describe('Pagination cursor from the previous response. Omit for the first page.')
});

const ListOutput = z.object({
    items: z.array(OutputSchema),
    next_cursor: z.string().optional()
});

exec: async (nango, input): Promise<z.infer<typeof ListOutput>> => {
    const response = await nango.get({
        // https://api-docs-url
        endpoint: '/api/v1/users',
        params: {
            ...(input.cursor && { cursor: input.cursor })
        },
        retries: 3
    });

    return {
        items: response.data.items.map((item: { id: string; name?: string | null }) => ({
            id: item.id,
            ...(item.name != null && { name: item.name })
        })),
        ...(response.data.next_cursor != null && { next_cursor: response.data.next_cursor })
    };
}
```

## ActionError

Use `nango.ActionError` for expected failures. Use standard `Error` for unexpected failures.

```typescript
if (response.status === 429) {
    throw new nango.ActionError({
        type: 'rate_limited',
        message: 'API rate limit exceeded',
        retry_after: response.headers['retry-after']
    });
}
```

Do not return null-filled objects to indicate not found. Throw `ActionError` instead.

## Dryrun examples

Validate an action:

```bash
nango dryrun <action-name> <connection-id> --validate -e dev --no-interactive --auto-confirm --input '{"key":"value"}'
```

Validate a no-input action:

```bash
nango dryrun <action-name> <connection-id> --validate -e dev --no-interactive --auto-confirm --input '{}'
```

Record mocks after validation passes:

```bash
nango dryrun <action-name> <connection-id> --save -e dev --no-interactive --auto-confirm --input '{"key":"value"}'
```

Stub metadata when needed:

```bash
nango dryrun <action-name> <connection-id> --validate -e dev --no-interactive --auto-confirm --input '{}' --metadata '{"team_id":"123"}'
```
