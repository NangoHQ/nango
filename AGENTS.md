# Nango Project Context

## Canonical Terms

- `function`: Preferred user-facing term for code hosted on Nango. Legacy code may still say `flow`, and some umbrella config names still use `sync`.
- `records`: Preferred term for the per-connection data layer. The codebase may still say `cache`.
- `provider`: Nango's internal supported-provider configuration for an external API.
- `integration`: The customer's Nango-side configuration for a provider.
- `connection`: The end-user's connection to a provider.
- `customer`: The Nango customer. If `user` is unqualified, it means the customer.
- `end-user`: The customer's customer.
- `catalog function`: A function available in the functions catalog, not yet deployed.
- `source: 'catalog'`: A deployed function that originated from the catalog. Surfaced to customers as "Source code: Nango".
- `source: 'standalone'`: A deployed function pushed via the `/remote-function/deploy` endpoint. Surfaced to customers as "Source code: Nango".
- `source: 'repo'`: A deployed function pushed via the Nango CLI from the customer's repo. Surfaced to customers as "Source code: your repo".
- `Nango CLI`: The tool name. Use `nango` only for specific commands.

## Core Model

- `provider -> integration -> connection -> function -> records`
- Nango supports external APIs as providers.
- Customers create integrations for those providers.
- End-users create connections through the customer's product.
- Functions run with an injected connection context.
- HTTP requests inside functions automatically use that connection's auth credentials.
- Records belong to that connection and power diffing plus change notifications.
- Environments partition integrations, connections, and functions.

## Critical Rules

- Use `source: 'repo'` vs `source: 'catalog'`/`source: 'standalone'` when contrasting ownership models internally.
- Customer-facing, ownership is either "Source code: Nango" (catalog or standalone) or "Source code: your repo" (repo).
- `catalog function` refers only to a function browsable in the catalog that has not been deployed yet.
- `nango deploy` only diffs and reconciles `source: 'repo'` functions from the Nango integrations folder.
- Functions with `source: 'catalog'` or `source: 'standalone'` are excluded from that deploy diff.
- Records are persisted in Postgres but should not be described as the customer's source-of-truth database.
- Records are scoped per connection and are not shared across connections or integrations.
- A function run cannot fetch records from another connection.
- `batchSave` is the main function API used to write records.
- Customers should store and reuse the `connection id` rather than managing provider credentials directly.

## Detailed Glossary

### Function

- Definition: Code hosted and executed by Nango.
- Ownership: Functions may be remote or self-managed.
- Execution: Functions run with an injected connection context.
- Auth: HTTP requests inside functions automatically use the connection's auth.
- Legacy naming: Older code may still use `flow`, and some umbrella config names still use `sync`.

#### Function Types

- `sync`: Scheduled per connection on a user-defined cron. Commonly polls a provider and writes records. Records need an `id` so Nango can diff previous and current state and notify through webhooks. Most useful when the provider lacks usable change webhooks.
- `action`: Triggered manually through an API call. Similar to a lambda-style invocation, but still runs with connection context and can write records.
- `webhook script`: Triggered by provider webhooks. Commonly maps incoming events into records and reuses the same diffing and notification pipeline as syncs.

### Records

- Definition: Per-connection data layer written by syncs, webhook scripts, and other functions such as actions.
- Storage: Persisted in Postgres.
- Why code says `cache`: The term reflects intended usage, not temporary-storage semantics.
- Purpose: Stores connection-scoped provider state so Nango can diff changes and notify subscribers.
- Identity: Each record must have an `id`.
- Scope: Not shared across connections or integrations.
- Main write path: `batchSave`.
- Non-goal: Not the customer's durable application database or source of truth.

### Provider

- Definition: Nango's internal supported-provider configuration for an external API.
- Example: If Nango supports Gmail as a provider, customers can create Gmail integrations.

### Integration

- Definition: The customer's configuration in Nango for a provider.
- Typical contents: Often auth credentials or auth app configuration.
- Multiplicity: A customer may have more than one integration for the same provider.
- Boundary: Not a generic synonym for provider.

### Connection

- Definition: The end-user's connection to a provider.
- Credentials: Nango manages the underlying credentials.
- Customer responsibility: The customer stores the connection id.
- Runtime relation: When a function executes, the connection is injected.
- Records relation: The records context belongs to that connection.

### Connection ID

- Definition: Stable identifier for a specific connection.
- Customer responsibility: Persist and reuse it.
- Runtime relation: Identifies which connection context a function run uses.
- Records relation: Determines which connection-scoped records context applies.

### Environment

- Definition: Workspace partition.
- Scope: Integrations, connections, and functions are scoped by environment.
- Naming: Often `dev` and `prod`, but names are arbitrary.
- RBAC: `is_production` is used for role-based access control.

### Customer

- Definition: The Nango customer, not the customer's end-user.
- Default wording: Prefer `customer`. If `user` is unqualified, it means the customer.

### End-User

- Definition: The customer's customer who creates connections.
- Relation: End-users create connections.

### Catalog Function

- Definition: Function available in the functions catalog that has not been deployed yet.
- User-facing workflow: Customers browse the catalog and deploy a catalog function from the dashboard.
- Legacy naming: Some code or product surfaces may still say `templates` or `public`.

### Functions Catalog

- Definition: Catalog of catalog functions in the dashboard.
- User workflow: Customers browse it and deploy catalog functions from it.

### Function source: 'catalog'

- Definition: A deployed function that originated from the functions catalog.
- Customer-facing label: "Source code: Nango".
- Deployment boundary: Excluded from the diff performed by `nango deploy`.

### Function source: 'standalone'

- Definition: A deployed function pushed directly via the `/remote-function/deploy` API endpoint.
- Customer-facing label: "Source code: Nango".
- Deployment boundary: Excluded from the diff performed by `nango deploy`.

### Function source: 'repo'

- Definition: A deployed function whose code is owned and versioned by the customer in their repo.
- Customer-facing label: "Source code: your repo".
- Source of truth: The Nango integrations folder.
- Deployment path: Deployed through the Nango CLI.
- Diff behavior: `nango deploy` reconciles these against the project contents — deleting a file and deploying removes the function from the cloud.

### Nango Integrations Project

- Definition: Customer-owned source project where `source: 'repo'` functions are defined and maintained.
- Initialization: Created with `nango init`.
- Ownership: Versioning and source control are handled by the customer.
- Deployment behavior: `nango deploy` upserts changed `source: 'repo'` functions and deletes removed ones.
- Exclusion rule: Functions with `source: 'catalog'` or `source: 'standalone'` are not included in that diff.
- Common setups: Separate repo or folder in a monorepo, typically deployed via CI/CD.

### Nango CLI

- Definition: Command-line tool for initializing, validating, running, compiling, and deploying `source: 'repo'` functions.
- Commands: `nango init`, `nango compile`, `nango dryrun`, `nango deploy`.
- `nango compile`: Builds and validates functions, runs Nango-specific checks, and produces function metadata plus bundled JavaScript sent to the server.
- `nango dryrun`: Compiles and runs a function locally against a provided connection id. Writes to records are emulated, not persisted.
- `nango deploy`: Compiles functions and reconciles deployed cloud state for `source: 'repo'` functions only.
