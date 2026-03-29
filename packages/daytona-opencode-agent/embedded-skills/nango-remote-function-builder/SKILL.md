---
name: nango-remote-function-builder
description: Builds Nango Functions using Nango's remote build API with checkpoint-first sync patterns, action and sync references, deletion strategies, and a docs-aligned dryrun/test workflow. Use when creating a remote Nango action or syncs.
---

# Nango Remote Function Builder
Builds and deploys a Nango functions (actions and syncs) remotely with repeatable patterns and validation steps. We use the Nango API to achieve this. Check `references/api.md` for how to do this.

## When to use
- User wants to build or modify a Nango function
- User wants to build an action in Nango
- User wants to build a sync in Nango

## Sync Strategy Gate (required before writing code)

If the task is a sync, read `references/syncs.md` before writing code and state one of these paths first:

- Checkpoint plan:
  - change source (`updated_at`, `modified_since`, changed-records endpoint, cursor, page token, offset/page, `since_id`, or webhook)
  - checkpoint schema
  - how the checkpoint changes the provider request or resume state
  - whether the request still walks the full dataset or returns changed rows only
  - delete strategy
- Full refresh blocker:
  - exact provider limitation from the docs or sample payloads
  - why checkpoints cannot work here

Invalid sync implementations:
- full refresh because it is simpler
- `saveCheckpoint()` without `getCheckpoint()`
- reading or saving a checkpoint without using it in request params or pagination state
- using `syncType: 'incremental'` or `nango.lastSyncDate` in a new sync
- using `trackDeletesStart()` / `trackDeletesEnd()` with a changed-only checkpoint (`modified_after`, `updated_after`, changed-records endpoint). Those requests omit unchanged rows, so `trackDeletesEnd()` will falsely delete them.
- using `trackDeletesStart()` / `trackDeletesEnd()` in an incremental sync that already has explicit deleted-record events

## Choose the Path

Action:
- One-time request, user-triggered, built with `createAction()`
- Read `references/actions.md` before writing code

Sync:
- Scheduled or webhook-driven cache updates built with `createSync()`
- Complete the Sync Strategy Gate first
- Read `references/syncs.md` before writing code

## Workflow (recommended)
1. Check if an integration exists or if it needs to be created or updated
2. Check if a connection exists
3. Decide whether this is an action or a sync.
4. Read the matching reference file: `references/actions.md` or `references/syncs.md`.
5. For syncs, inspect the provider docs or sample payloads for a checkpointable path first (`updated_at`, `modified_since`, changed-records endpoints, deleted-record endpoints, cursors, page tokens, offset/page, `since_id`, or webhooks), decide whether it returns the full dataset or only changed rows, and complete the Sync Strategy Gate before writing code.
6. Gather required inputs and external values. If you need connection details, credentials, or discovery calls, use the Nango HTTP API (Connections/Proxy; auth with the Nango secret key). Do not invent Nango CLI token/connection commands.
7. Always assume this will be a Zero YAML TypeScript project (no `nango.yaml`) and you are in the Nango root (`.nango/` exists).
8. You shouldn't use the local file system, we are creating the function remotely. Create or update the function by using the Nango Remote build API. This will require to keep the sync/action to a single file, as the API only accepts 1 file. Use the create 
9. Once the function is deployed, run it.
10. Report to the user the result, if something went wrong on either the build or the run, fix it and retry.

## Required Inputs (Ask User if Missing)

Always:
- Integration ID (provider name)
- Connection ID (for running)
- Script name (kebab-case)
- API reference URL or sample response
- Metadata JSON if required

Action-specific:
- Use case summary
- Input parameters
- Output fields

Sync-specific:
- Model name (singular, PascalCase)
- Frequency (every hour, every 5 minutes, etc.)
- Checkpoint schema (timestamp, cursor, page token, offset/page, `since_id`, or composite)
- How the checkpoint changes the provider request or resume state
- Delete strategy (deleted-record endpoint/webhook, or why full refresh is required)
- If proposing a full refresh, the exact provider limitation that blocks checkpoints from the docs/sample response

If any required external values are missing, ask a targeted question after checking the repo and provider docs. For syncs, choose a checkpoint plus deletion strategy whenever the provider supports one. If you cannot find a viable checkpoint strategy, state exactly why before writing a full refresh.

## Preconditions (Do Before Writing Code)

- This is a TypeScript Project (No nango.yaml)

## Remote Project Structure and Naming

```
./
|-- .nango/
|-- index.ts
|-- hubspot/
|   |-- actions/
|   |   `-- create-contact.ts
|   `-- syncs/
|       `-- fetch-contacts.ts
`-- slack/
    `-- actions/
        `-- post-message.ts
```

- Provider directories: lowercase (hubspot, slack)
- Action files: kebab-case (create-contact.ts)
- Sync files: kebab-case (many teams use a `fetch-` prefix, but it's optional)
- One function per file (action or sync)
- All actions and syncs must be imported in index.ts

Use side-effect imports only (no default/named imports). Include the `.js` extension.

```typescript
// index.ts
import './github/actions/get-top-contributor.js';
import './github/syncs/fetch-issues.js';
```

Symptom of incorrect registration: the file compiles but you see `No entry points found in index.ts...` or the function never appears.

## Non-Negotiable Rules

### Be chatty
Lets constantly report back to the user what we are doing and why. We want them to know what is going on.

### Shared platform constraints

- Define functions with `createAction()` or `createSync()`.
- Remote server will register every action/sync in `index.ts`.
- You cannot use/import arbitrary third-party packages in Functions. Relative imports inside the Nango project are supported. Pre-included dependencies include `zod`, `crypto`/`node:crypto`, and `url`/`node:url`.
- Use the Nango HTTP API for connection discovery, credentials, and proxy calls outside function code. Do not invent Nango CLI token/connection commands.
- Add an API doc link comment above each provider API call.
- Action outputs cannot exceed 2MB.
- HTTP request retries default to `0`. Set `retries` intentionally (and be careful retrying non-idempotent writes).

### Sync rules

- Sync records must include a stable string `id`.
- New syncs default to checkpoints. Define a `checkpoint` schema and use `nango.getCheckpoint()` at the start plus `nango.saveCheckpoint()` after each processed batch/page.
- A checkpoint is only valid if it changes the provider request or resume state (`since`, `updated_after`, `cursor`, `page_token`, `offset`, `page`, `since_id`, etc.). Saving a checkpoint without using it is not a valid incremental sync.
- For new syncs, do not use `syncType: 'incremental'` or `nango.lastSyncDate`; checkpoints replace that pattern.
- Default list sync logic to `nango.paginate(...)` plus `nango.batchSave(...)`.
- Prefer `batchDelete()` when the provider exposes deleted records, tombstones, or delete webhooks.
- Full refresh is fallback only. Use it only when the provider cannot return changed records, deleted records, or resumable state, or when the dataset is trivially small.
- Before writing a full refresh sync, cite the exact provider limitation from the docs or sample payloads. "It is easier" is not a valid reason.
- `deleteRecordsFromPreviousExecutions()` is deprecated. For full refresh fallback, call `await nango.trackDeletesStart('<ModelName>')` before fetching/saving and `await nango.trackDeletesEnd('<ModelName>')` only after a successful full fetch plus save.
- Never combine `trackDeletesStart()` / `trackDeletesEnd()` with a changed-only checkpoint request (`modified_after`, `updated_after`, changed-records endpoint, etc.). Those requests return only changed rows, so `trackDeletesEnd()` would delete every unchanged row that was omitted from the response.
- Checkpointed full refreshes are still full refreshes. Only call `trackDeletesEnd()` in the execution that finishes the complete refresh window.

### Conventions

- Prefer explicit parameter names (`user_id`, `channel_id`, `team_id`).
- Add `.describe()` examples for IDs, timestamps, enums, and URLs.
- Avoid `any`; use inline types when mapping responses.
- Prefer static Nango endpoint paths (avoid `:id` / `{id}` in the exposed endpoint); pass IDs in input/params.
- Add an API doc link comment above each provider API call.
- Standardize list actions on `cursor`/`next_cursor`.
- For optional outputs, return `null` only when the output schema models `null`.
- Use `nango.zodValidateInput()` when you need custom input validation/logging.
- Zod: `z.object()` strips unknown keys by default. For provider payload pass-through use `z.object({}).passthrough()`, `z.record(z.unknown())`, or `z.unknown()` with minimal refinements.

### Parameter Naming Rules

- IDs: suffix with _id (user_id, channel_id)
- Names: suffix with _name (channel_name)
- Emails: suffix with _email (user_email)
- URLs: suffix with _url (callback_url)
- Timestamps: use *_at or *_time (created_at, scheduled_time)

Mapping example (API expects a different parameter name):

```typescript
const InputSchema = z.object({
    user_id: z.string()
});

const config: ProxyConfiguration = {
    endpoint: 'users.info',
    params: {
        user: input.user_id
    },
    retries: 3
};
```

## References

- Action patterns, CRUD examples, metadata usage, and ActionError examples: `references/actions.md`
- Sync patterns, concrete checkpoint examples, delete strategies, and full refresh fallback: `references/syncs.md`

## Useful Nango docs (quick links)
- Functions runtime SDK reference: https://nango.dev/docs/reference/functions
- Implement an action: https://nango.dev/docs/implementation-guides/use-cases/actions/implement-an-action
- Implement a sync: https://nango.dev/docs/implementation-guides/use-cases/syncs/implement-a-sync
- Checkpoints: https://nango.dev/docs/implementation-guides/use-cases/syncs/checkpoints
- Deletion detection (full vs incremental): https://nango.dev/docs/implementation-guides/use-cases/syncs/deletion-detection
- Nango HTTP API reference: https://nango.dev/docs/reference/api

## Deploy

Use the `nango_base_url` from context if provided, otherwise default to `https://api-development.nango.dev`.

The function must be deployed with `POST {nango_base_url}/sf-deploy`, then dry-run with `POST {nango_base_url}/sf-run`. Check `references/api.md`.

## When API Docs Do Not Render

If web fetching returns incomplete docs (JS-rendered):
- Ask the user for a sample response
- Use `{nango_base_url}/sf-deploy` and `{nango_base_url}/sf-run` to test it and iterate over it

## Final Checklists

Action:
- [ ] `references/actions.md` was used for the action pattern
- [ ] Schemas and types are clear (inline or relative imports)
- [ ] `createAction()` includes endpoint, input, output, and scopes when required
- [ ] Provider call includes an API doc link comment and intentional retries
- [ ] `nango.ActionError` is used for expected failures
- [ ] Deploy succeeds by using `{nango_base_url}/sf-deploy`
- [ ] Run succeeds and returns the expected result using `{nango_base_url}/sf-run`

Sync:
- [ ] Nango root verified
- [ ] `references/syncs.md` was used for the sync pattern
- [ ] Models map is defined and record ids are stable strings
- [ ] Incremental strategy was chosen first and a `checkpoint` schema is defined unless full refresh fallback is explicitly justified from provider docs/sample responses
- [ ] `nango.getCheckpoint()` is read at the start and `nango.saveCheckpoint()` is used after each processed batch/page
- [ ] Checkpoint data changes the provider request or resume state (`since`, `updated_after`, `cursor`, `page_token`, `offset`, `page`, `since_id`, etc.)
- [ ] Changed-only checkpoint syncs (`modified_after`, `updated_after`, changed-records endpoint) do not use `trackDeletesStart()` / `trackDeletesEnd()`
- [ ] If checkpoints were not used, the response explains exactly why no viable checkpoint strategy exists
- [ ] List sync logic uses `nango.paginate()` plus `nango.batchSave()` unless the API shape requires a manual loop
- [ ] Deletion strategy matches the sync type: `batchDelete()` for incremental only when the provider returns explicit deletions; otherwise full-refresh fallback uses `trackDeletesStart()` before fetch/save and `trackDeletesEnd()` only after a successful full fetch plus save
- [ ] Metadata handled if required
- [ ] Deploy succeeds by using `{nango_base_url}/sf-deploy`
- [ ] Run succeeds and returns the expected result using `{nango_base_url}/sf-run`
