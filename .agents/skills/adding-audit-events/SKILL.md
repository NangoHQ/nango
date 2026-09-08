---
name: adding-audit-events
description: Use when adding or changing an audited Nango endpoint, or deciding one shouldn't be audited - covers the vocabulary table, metadata typing, spec placement, mount ordering, and the webapp filter list
---

# Adding Audit Events

`AuditEventTable` in `packages/types/lib/audit-trail/event.ts` is the source of truth: it maps each
resource to its actions and the metadata each may carry. The event union, the metadata lookup, the
per-resource action lists and the webapp filters all derive from it. Add the action there first and let
the compiler tell you what else to touch.

The trail is **control-plane only** — configuration, state and authentication. Runtime traffic (records,
proxy, sync execution) is data plane and stays out; audit it and you get millions of rows a month.

## Workflow

1. **Vocabulary** — in `AuditEventTable`, under the resource: `<action>: <MetadataShape>;` or
   `<action>: never;` when the action carries no metadata.

2. **Metadata shape**, if any — `packages/types/lib/audit-trail/metadata.ts`. Name it for what it holds,
   never for one action: `integration.created` and `integration.deleted` share
   `IntegrationProviderMetadata` because both record only the provider.

3. **Endpoint type** — every customer-facing endpoint declares one:
   - `Audit: AuditPolicy<'<resource>', '<action>', 'account' | 'environment'>`
   - `Audit: { kind: 'no-audit'; reason: '<why>' }` — use `'data-plane operation'` for runtime traffic.

4. **Spec** — `packages/server/lib/middleware/audit/<resource>.middleware.ts`:

   ```ts
   export const auditThingDone = auditable<PostThing>({
       policy: Audit.auditable({ resource: 'thing', action: 'done', scope: 'environment' }),
       target: (req) => makeTarget('thing', nonEmptyString(req.body.id)),
       metadata: (req) => omitUndefined<ThingDoneMetadata>({ … })
   });
   ```

   Mounted middleware first, in the vocabulary's action order, private spec then public for the same
   action; multi-action emitters last; helpers below all of them.

5. **Barrel** — add the export to `audit/index.ts`. Hand-written on purpose: it declares what has scope
   beyond the folder, so never `export *`.

6. **Mount** — `routes.public.ts` / `routes.private.ts`, **before `withScope`**:
   `.post(apiAuth, auditThingDone, withScope('…'), handler)`. After the scope check, denials are lost.

7. **Test** — `<resource>.middleware.unit.test.ts`, scaffolding from `./testing.js`.

8. **Webapp** — add the action to `actionsByResource` in `packages/webapp/src/pages/Audit/constants.ts`.
   A type check pins it to the vocabulary, so omitting it is a build error. Labels are derived.

9. **New kind of target** — add it to `AuditTargetType`.

## Gotchas

- **Resolvers run before zod.** `req.body` / `params` / `query` are raw at that point, whatever the
  endpoint type says. Use the guards in `input.ts`: `nonEmptyString`, `positiveInt`, `param`, `query`,
  `bodyField`.
- **`target` and `metadata` resolve before `next()`**, so a value the handler generates isn't available
  yet. Use `targetFromResponse` / `metadataFromResponse`.
- **A 403 means no handler ran**, so anything only the handler knows is missing from exactly the rows an
  auditor cares about most. Prefer reading from the request.
- **`scope: 'account'` nulls the event's environment**, whatever `res.locals` holds.
- **On the MCP path only** (`defineManagementMcpTool`), a stray metadata key *alongside* a valid one is
  accepted — the audit type is a union over the vocabulary. A stray key alone, a wrong type, and metadata
  on a `never` action all fail.
- **Grep `input.ts` and `lookups.ts` before adding a helper.** The target and metadata builders usually
  exist, and near-identical `…Target` functions get flagged in review.

## Review Checklist

- [ ] `npm run ts-build` clean — it catches a missing webapp entry, metadata that doesn't fit the action,
      and metadata on an action declared `never`
- [ ] Unit test asserts the common fields (`accountId`, `environment`, `actor`, `outcome`), not only the
      one it is named for
- [ ] Test break-checked: remove the target or a metadata key and confirm it goes red
- [ ] Audit middleware sits before `withScope` on every new mount
- [ ] Denial and failure paths still identify the event — check what a 403 records, not just the 200
