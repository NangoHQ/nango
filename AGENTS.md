Use `npm` as the project package manager.
After running the initial `npm install` or `npm ci`, run `npm run prepare` to install Husky git hooks.

## TypeScript Build

Run `npm run ts-build` before autofixing lint errors using npm run lint:fix. Fresh worktrees don't have `dist/` (gitignored), so workspace packages like `@nangohq/types` can't resolve, causing false ESLint errors and broken type-checking.

## Running Nango locally

For full local dev setup (Docker, service URLs, auth flows, troubleshooting), use the `running-and-testing-locally` skill.

## Running the webapp dev server

### Multiple worktrees (local backend)

Run `npm run dev -w packages/webapp` from each worktree. Vite picks the next free port (3000 → 3001 → 3002 …) and rewrites `apiUrl` in `env.js` to match, routing all API traffic through Vite's proxy to the local backend at `localhost:3003`.

### Remote API

Pass `REMOTE_API=<env>` to proxy all API traffic to a live backend instead. No local backend needed.

```bash
REMOTE_API=dev npm run dev -w packages/webapp       # https://api-development.nango.dev
REMOTE_API=staging npm run dev -w packages/webapp   # https://api-staging.nango.dev
REMOTE_API=prod npm run dev -w packages/webapp      # https://api.nango.dev
```

# Nango Project Context

## Canonical Terms

- `function`: Preferred user-facing term for code hosted on Nango. Legacy code may still say `flow`, and some umbrella config names still use `sync`.
- `records`: Preferred term for the per-connection data layer. The codebase may still say `cache`.
- `provider`: Nango's internal supported-provider configuration for an external API.
- `integration`: The customer's Nango-side configuration for a provider.
- `connection`: The end-user's connection to a provider.
- `customer`: The Nango customer. If `user` is unqualified, it means the customer.
- `end-user`: The customer's customer.
- `pre-built function`: A function available in the functions catalog.
- `remote function`: An active deployed catalog function whose code the customer does not own.
- `self-managed function`: A function whose code the customer owns and deploys from a Nango integrations project.
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

- Use `remote function` vs `self-managed function` when contrasting ownership models.
- Use `pre-built function` when talking about catalog availability, not ownership.
- Enabling a pre-built function in the dashboard deploys it as a remote function.
- `nango deploy` only diffs and reconciles self-managed functions from the Nango integrations project.
- Remote functions are excluded from that deploy diff.
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

### Pre-built Function

- Definition: Function available in the functions catalog.
- User-facing workflow: Customers enable or activate it from the dashboard.
- Internal behavior: Enabling deploys it as a remote function.
- Legacy naming: Some code or product surfaces may still say `templates` or `public`.

### Functions Catalog

- Definition: Catalog of pre-built functions in the dashboard.
- User workflow: Customers browse it and enable pre-built functions from it.

### Remote Function

- Definition: Active function deployed from the catalog whose code the customer does not own.
- Origin: Created when a customer enables a pre-built function.
- Deployment boundary: Excluded from the diff performed by `nango deploy`.
- Use: Preferred term when contrasting ownership models.

### Self-Managed Function

- Definition: Function whose code is owned and versioned by the customer.
- Source of truth: The Nango integrations project.
- Deployment path: Deployed through the Nango CLI.
- Diff behavior: `nango deploy` reconciles these against the project contents.
- Use: Preferred term when contrasting ownership models.

### Nango Integrations Project

- Definition: Customer-owned source project where self-managed functions are defined and maintained.
- Initialization: Created with `nango init`.
- Ownership: Versioning and source control are handled by the customer.
- Deployment behavior: `nango deploy` upserts changed self-managed functions and deletes removed ones.
- Exclusion rule: Remote functions are not included in that diff.
- Common setups: Separate repo or folder in a monorepo, typically deployed via CI/CD.

### Nango CLI

- Definition: Command-line tool for initializing, validating, running, compiling, and deploying self-managed functions.
- Commands: `nango init`, `nango compile`, `nango dryrun`, `nango deploy`.
- `nango compile`: Builds and validates functions, runs Nango-specific checks, and produces function metadata plus bundled JavaScript sent to the server.
- `nango dryrun`: Compiles and runs a function locally against a provided connection id. Writes to records are emulated, not persisted.
- `nango deploy`: Compiles functions and reconciles deployed cloud state for self-managed functions only.
