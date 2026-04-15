---
name: managing-vercel-infrastructure
description: Use when deploying to Vercel, managing projects, domains, environment variables, DNS records, rollbacks, or reading logs - provides pre-authenticated REST API patterns for all Vercel resources via ${ZIRALOOP_VERCEL_API_URL} proxy
---

# Managing Vercel Infrastructure

## Overview

Manage Vercel cloud infrastructure through a pre-authenticated REST API proxy. All requests go to `${ZIRALOOP_VERCEL_API_URL}` with no auth headers — the proxy handles authentication. Vercel uses a standard REST API (not GraphQL).

## When to Use

- Deploying or redeploying applications on Vercel
- Managing projects, environment variables, or domains
- Reading build or runtime logs
- Rolling back or promoting deployments
- Managing DNS records, aliases, or certificates
- Configuring firewall rules, edge config, or rolling releases
- Team and access management

## Quick Reference

Every call is `curl -s -X <METHOD> ${ZIRALOOP_VERCEL_API_URL}<path>`. Always pipe through `jq`.

For team-scoped operations, append `?teamId=TEAM_ID` or `?slug=TEAM_SLUG` to any endpoint.

### Projects

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v10/projects` | List projects (`?search=`, `?limit=`) |
| GET | `/v9/projects/{idOrName}` | Get project details |
| POST | `/v11/projects` | Create project |
| PATCH | `/v9/projects/{idOrName}` | Update project settings |
| DELETE | `/v9/projects/{idOrName}` | Delete project |
| POST | `/v1/projects/{id}/pause` | Pause project |
| POST | `/v1/projects/{id}/unpause` | Unpause project |

### Deployments

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v13/deployments` | Create deployment |
| GET | `/v6/deployments` | List deployments (`?projectId=`, `?state=`, `?limit=`) |
| GET | `/v13/deployments/{idOrUrl}` | Get deployment details |
| PATCH | `/v12/deployments/{id}/cancel` | Cancel deployment |
| DELETE | `/v13/deployments/{id}` | Delete deployment |
| GET | `/v3/deployments/{idOrUrl}/events` | Build logs |
| GET | `/v1/projects/{projectId}/deployments/{deploymentId}/runtime-logs` | Runtime logs |
| POST | `/v1/projects/{projectId}/rollback/{deploymentId}` | Rollback |
| POST | `/v10/projects/{projectId}/promote/{deploymentId}` | Promote to production |
| GET | `/v1/projects/{projectId}/promote/aliases` | Check promote status |

### Environment Variables

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v10/projects/{idOrName}/env` | List env vars (`?decrypt=true`) |
| POST | `/v10/projects/{idOrName}/env` | Create env vars (`?upsert=true` for idempotent) |
| GET | `/v1/projects/{idOrName}/env/{id}` | Get decrypted value |
| PATCH | `/v9/projects/{idOrName}/env/{id}` | Edit env var |
| DELETE | `/v9/projects/{idOrName}/env/{id}` | Delete env var |
| DELETE | `/v1/projects/{idOrName}/env` | Batch delete env vars |

### Domains

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v5/domains` | List all domains |
| POST | `/v7/domains` | Add domain to Vercel |
| GET | `/v5/domains/{domain}` | Get domain info |
| GET | `/v6/domains/{domain}/config` | Check DNS config status |
| DELETE | `/v6/domains/{domain}` | Remove domain |
| POST | `/v10/projects/{idOrName}/domains` | Add domain to project |
| POST | `/v9/projects/{idOrName}/domains/{domain}/verify` | Verify domain |
| PATCH | `/v9/projects/{idOrName}/domains/{domain}` | Update project domain |
| DELETE | `/v9/projects/{idOrName}/domains/{domain}` | Remove domain from project |

### DNS Records

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v5/domains/{domain}/records` | List DNS records |
| POST | `/v2/domains/{domain}/records` | Create DNS record |
| PATCH | `/v1/domains/records/{recordId}` | Update DNS record |
| DELETE | `/v2/domains/{domain}/records/{recordId}` | Delete DNS record |

### Aliases

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v4/aliases` | List all aliases |
| POST | `/v2/deployments/{id}/aliases` | Assign alias to deployment |
| GET | `/v2/deployments/{id}/aliases` | List deployment aliases |
| DELETE | `/v2/aliases/{aliasId}` | Delete alias |

### Edge Config

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/edge-config` | List all edge configs |
| POST | `/v1/edge-config` | Create edge config |
| GET | `/v1/edge-config/{id}` | Get edge config |
| DELETE | `/v1/edge-config/{id}` | Delete edge config |
| GET | `/v1/edge-config/{id}/items` | Get all items |
| PATCH | `/v1/edge-config/{id}/items` | Batch update items |
| GET | `/v1/edge-config/{id}/item/{key}` | Get single item |

### Teams

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v2/user` | Get authenticated user |
| GET | `/v2/teams` | List teams |
| GET | `/v2/teams/{teamId}` | Get team details |
| GET | `/v3/teams/{teamId}/members` | List team members |

### Caching

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/edge-cache/purge-all` | Purge all CDN cache |
| POST | `/v1/edge-cache/invalidate-by-tags` | Invalidate cache by tags |

### Firewall

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/security/firewall/config/active` | Read active firewall config |
| PUT | `/v1/security/firewall/config` | Set firewall rules |
| PATCH | `/v1/security/firewall/config` | Update firewall rules |

### Webhooks

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/webhooks` | List webhooks |
| POST | `/v1/webhooks` | Create webhook |
| DELETE | `/v1/webhooks/{id}` | Delete webhook |

### Rolling Releases

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/projects/{idOrName}/rolling-release` | Get rolling release status |
| PATCH | `/v1/projects/{idOrName}/rolling-release/config` | Configure rolling releases |
| POST | `/v1/projects/{idOrName}/rolling-release/approve-stage` | Advance to next stage |
| POST | `/v1/projects/{idOrName}/rolling-release/complete` | Force-complete (100% traffic) |

## Implementation

### Request pattern

```bash
curl -s -X GET "${ZIRALOOP_VERCEL_API_URL}/v10/projects" \
  | jq 'if .error then {error: .error.message} else . end'
```

No Authorization header. No auth tokens. The proxy handles it.

For POST/PATCH/PUT requests, send JSON body:
```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v11/projects" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-project"}' \
  | jq '.id'
```

### Rule 1: Always filter with jq

Never let raw JSON into your context. Always pipe through `jq` to extract only what you need.

```bash
# BAD
curl -s "${ZIRALOOP_VERCEL_API_URL}/v10/projects"

# GOOD
curl -s "${ZIRALOOP_VERCEL_API_URL}/v10/projects" \
  | jq '.projects[] | {id, name, framework}'
```

Common jq patterns:
```bash
# List projects — names and IDs only
| jq '.projects[] | {id, name}'

# Get deployment status
| jq '{id: .id, state: .readyState, url: .url}'

# List env vars — keys and targets only (no values!)
| jq '.envs[] | {id, key, target, type}'

# Find production env by name
| jq '.projects[] | select(.name == "my-app") | .id'

# Check for API errors
| jq 'if .error then {error: .error.message, code: .error.code} else . end'

# Paginate — get next cursor
| jq '.pagination.next'
```

### Rule 2: Never expose sensitive data

Your output is logged. Mask secrets, credentials, and env var values.

**Environment variables** — list keys only, mask values:
```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v10/projects/PROJECT/env" \
  | jq '.envs[] | {id, key, target, type, value: (if (.type == "secret" or .type == "encrypted" or .type == "sensitive" or (.key | test("SECRET|KEY|TOKEN|PASSWORD|URL|DSN|CREDENTIALS|PRIVATE|MONGO|POSTGRES|MYSQL|REDIS|AMQP"; "i"))) then "****" else .value end)}'
```

**Decrypted env var** — pipe to file, never print:
```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v1/projects/PROJECT/env/ENV_ID" \
  | jq -r '.value' > /tmp/.env_secret
```

**Webhook secrets** — mask after creation:
```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v1/webhooks" \
  -H "Content-Type: application/json" \
  -d '...' \
  | jq '{id, events, url, secret: "****"}'
```

### Rule 3: Error handling

Vercel returns errors as `{ "error": { "code": "...", "message": "..." } }`:
```bash
curl -s ... | jq 'if .error then {error: .error.message, code: .error.code} else . end'
```

### Pagination

List endpoints return `{ pagination: { count, next, prev } }`. Use `next` as a timestamp cursor:
```bash
# First page
curl -s "${ZIRALOOP_VERCEL_API_URL}/v6/deployments?projectId=PROJ&limit=20" | jq '{deployments: [.deployments[] | {id, state: .readyState, created: .created}], next: .pagination.next}'

# Next page
curl -s "${ZIRALOOP_VERCEL_API_URL}/v6/deployments?projectId=PROJ&limit=20&from=NEXT_TIMESTAMP" | jq '...'
```

### Team scoping

Append `?teamId=TEAM_ID` or `?slug=TEAM_SLUG` to any endpoint for team-scoped operations:
```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v10/projects?teamId=team_xxx" | jq '.projects[] | {id, name}'
```

### Workflows

**Create project and deploy from git:**
```bash
PROJECT_ID=$(curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v11/projects" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app", "framework": "nextjs", "gitRepository": {"type": "github", "repo": "owner/repo"}}' \
  | jq -r '.id')

echo "Created project: $PROJECT_ID"
```

**Set env vars then deploy:**
```bash
# Upsert env vars (idempotent)
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v10/projects/my-app/env?upsert=true" \
  -H "Content-Type: application/json" \
  -d '[{"key":"DATABASE_URL","value":"postgres://...","type":"encrypted","target":["production","preview"]},{"key":"NODE_ENV","value":"production","type":"plain","target":["production"]}]' \
  | jq '[.[] | {key, id}]'

# Create deployment
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v13/deployments" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app", "target": "production", "gitSource": {"type": "github", "ref": "main", "repoId": "REPO_ID"}}' \
  | jq '{id, url, readyState}'
```

**Check deployment status and read logs on failure:**
```bash
# Check status
STATE=$(curl -s "${ZIRALOOP_VERCEL_API_URL}/v13/deployments/DEPLOY_ID" \
  | jq -r '.readyState')

echo "State: $STATE"

# If ERROR — read build logs
curl -s "${ZIRALOOP_VERCEL_API_URL}/v3/deployments/DEPLOY_ID/events" \
  | jq -r '.[] | select(.type == "stdout" or .type == "stderr") | "\(.date) \(.text // .payload.text // "")"'
```

**Rollback production:**
```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v1/projects/PROJECT_ID/rollback/DEPLOY_ID" \
  | jq '{status: .status}'
```

**Add custom domain with DNS:**
```bash
# Add domain to project
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v10/projects/my-app/domains" \
  -H "Content-Type: application/json" \
  -d '{"name": "app.example.com"}' \
  | jq '{name, verified, verification}'

# Verify after DNS is set
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v9/projects/my-app/domains/app.example.com/verify" \
  | jq '{name, verified}'
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Dumping raw API response into context | Always pipe through `jq` to extract needed fields |
| Printing env var values in output | Mask with jq type/key check — see Rule 2 |
| Sending Authorization header | Proxy handles auth — no header needed |
| Not using `?upsert=true` on env var creation | Without it, duplicate keys cause errors |
| Forgetting `?teamId=` for team projects | Always include for team-scoped operations |
| Creating env vars one at a time | POST accepts an array — batch them |
| Polling deployment status in tight loop | Check every 5-10 seconds, not continuously |
| Not checking `.error` field | Always check for errors before processing response |
| Using wrong API version in path | Each endpoint has a specific version — use the versions from this doc |

## Env Var Types

| Type | Behavior |
|------|----------|
| `plain` | Visible in dashboard, readable via API |
| `encrypted` | Encrypted at rest, decrypted at build/runtime, readable via API with `?decrypt=true` |
| `sensitive` | Write-only — never readable via API after creation |
| `system` | Auto-populated by Vercel (e.g., `VERCEL_URL`) |

Env var targets: `production`, `preview`, `development`. Pass as array: `"target": ["production", "preview"]`

## Deployment States

`QUEUED` → `INITIALIZING` → `BUILDING` → `READY` (or `ERROR` / `CANCELED`)

Substates: `STAGED`, `ROLLING`, `PROMOTED`

## Framework Values

`nextjs`, `remix`, `astro`, `sveltekit`, `nuxtjs`, `gatsby`, `vue`, `react`, `angular`, `svelte`, `vite`, `express`, `fastify`, `nestjs`, `django`, `fastapi`, `python`, `node`, `go`, `rust`, `ruby`, `null`

## DNS Record Types

`A`, `AAAA`, `ALIAS`, `CAA`, `CNAME`, `HTTPS`, `MX`, `SRV`, `TXT`, `NS`

---

## API Endpoint Reference

Detailed curl examples for each endpoint. Only request the fields you need.

### GET /v2/user — Who am I?

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v2/user" | jq '{id: .user.id, name: .user.name, email: .user.email}'
```

### GET /v10/projects — List projects

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v10/projects?limit=20" \
  | jq '.projects[] | {id, name, framework}'
```

With search: `?search=my-app&limit=10`

### GET /v9/projects/{idOrName} — Get project

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v9/projects/my-app" \
  | jq '{id, name, framework, nodeVersion, targets}'
```

### POST /v11/projects — Create project

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v11/projects" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-app",
    "framework": "nextjs",
    "gitRepository": {"type": "github", "repo": "owner/repo"},
    "buildCommand": "next build",
    "outputDirectory": ".next",
    "environmentVariables": [
      {"key": "NODE_ENV", "value": "production", "type": "plain", "target": ["production"]}
    ]
  }' \
  | jq '{id, name}'
```

Optional fields: `installCommand`, `devCommand`, `rootDirectory`, `serverlessFunctionRegion`, `publicSource`, `resourceConfig` (`{ functionDefaultTimeout, functionDefaultMemoryType: "standard"|"performance", buildMachineType: "enhanced"|"turbo"|"standard" }`)

### PATCH /v9/projects/{idOrName} — Update project

```bash
curl -s -X PATCH "${ZIRALOOP_VERCEL_API_URL}/v9/projects/my-app" \
  -H "Content-Type: application/json" \
  -d '{
    "buildCommand": "next build",
    "nodeVersion": "22.x",
    "serverlessFunctionRegion": "iad1",
    "autoExposeSystemEnvs": true
  }' \
  | jq '{id, name}'
```

Other fields: `framework`, `installCommand`, `outputDirectory`, `rootDirectory`, `commandForIgnoringBuildStep`, `gitForkProtection`, `publicSource`, `previewDeploymentsDisabled`, `passwordProtection`, `ssoProtection`, `trustedIps`, `resourceConfig`, `skewProtectionMaxAge`


### POST /v1/projects/{id}/pause — Pause project

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v1/projects/PROJECT_ID/pause" | jq '.'
```

### POST /v1/projects/{id}/unpause — Unpause project

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v1/projects/PROJECT_ID/unpause" | jq '.'
```

---

### POST /v13/deployments — Create deployment

From git:
```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v13/deployments" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-app",
    "target": "production",
    "gitSource": {"type": "github", "ref": "main", "repoId": "REPO_ID"}
  }' \
  | jq '{id, url, readyState}'
```

Redeploy existing:
```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v13/deployments" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app", "deploymentId": "EXISTING_DEPLOY_ID", "target": "production"}' \
  | jq '{id, url, readyState}'
```

Optional: `?forceNew=1`, `?skipAutoDetectionConfirmation=1`

Body fields: `project`, `target` (`"production"` | `"staging"` | omit for preview), `customEnvironmentSlugOrId`, `files` (array), `gitMetadata`, `projectSettings`, `meta`

### GET /v6/deployments — List deployments

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v6/deployments?projectId=PROJECT_ID&limit=10" \
  | jq '.deployments[] | {id, state: .readyState, url, created: .created}'
```

Filters: `?state=READY`, `?target=production`, `?branch=main`, `?sha=abc123`, `?from=TIMESTAMP`, `?to=TIMESTAMP`

### GET /v13/deployments/{idOrUrl} — Get deployment

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v13/deployments/DEPLOY_ID" \
  | jq '{id, name, url, readyState, readySubstate, inspectorUrl, alias, createdAt}'
```

### PATCH /v12/deployments/{id}/cancel — Cancel deployment

```bash
curl -s -X PATCH "${ZIRALOOP_VERCEL_API_URL}/v12/deployments/DEPLOY_ID/cancel" \
  | jq '{id, readyState}'
```

### GET /v3/deployments/{idOrUrl}/events — Build logs

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v3/deployments/DEPLOY_ID/events" \
  | jq -r '.[] | select(.type == "stdout" or .type == "stderr") | "\(.date) [\(.type)] \(.text // .payload.text // "")"'
```

### GET /v1/projects/{projectId}/deployments/{deploymentId}/runtime-logs — Runtime logs

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v1/projects/PROJECT_ID/deployments/DEPLOY_ID/runtime-logs" \
  | jq -r '.[] | "\(.timestamp) \(.message)"'
```

### POST /v1/projects/{projectId}/rollback/{deploymentId} — Rollback

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v1/projects/PROJECT_ID/rollback/DEPLOY_ID" \
  | jq '{status: .status}'
```

### POST /v10/projects/{projectId}/promote/{deploymentId} — Promote to production

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v10/projects/PROJECT_ID/promote/DEPLOY_ID" \
  | jq '{status: .status}'
```

### GET /v1/projects/{projectId}/promote/aliases — Check promote status

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v1/projects/PROJECT_ID/promote/aliases" \
  | jq '.aliases[] | {alias: .alias, status: .status}'
```

---

### GET /v10/projects/{idOrName}/env — List env vars

```bash
# Keys and metadata only — mask values
curl -s "${ZIRALOOP_VERCEL_API_URL}/v10/projects/my-app/env" \
  | jq '.envs[] | {id, key, target, type}'
```

With decryption (pipe values to file, don't print):
```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v10/projects/my-app/env?decrypt=true" \
  | jq '.envs' > /tmp/.env_vars.json
```

### POST /v10/projects/{idOrName}/env — Create env vars

Single:
```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v10/projects/my-app/env?upsert=true" \
  -H "Content-Type: application/json" \
  -d '{"key": "DATABASE_URL", "value": "postgres://...", "type": "encrypted", "target": ["production", "preview"]}' \
  | jq '{id, key}'
```

Batch:
```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v10/projects/my-app/env?upsert=true" \
  -H "Content-Type: application/json" \
  -d '[
    {"key": "DATABASE_URL", "value": "postgres://...", "type": "encrypted", "target": ["production"]},
    {"key": "REDIS_URL", "value": "redis://...", "type": "encrypted", "target": ["production"]},
    {"key": "NODE_ENV", "value": "production", "type": "plain", "target": ["production"]}
  ]' \
  | jq '[.[] | {id, key}]'
```

Fields: `key` (required), `value` (required), `type` (required: `plain`|`encrypted`|`sensitive`), `target` (required: array of `production`|`preview`|`development`), `gitBranch` (optional, requires target=preview), `comment` (optional, max 500), `customEnvironmentIds` (optional)

### GET /v1/projects/{idOrName}/env/{id} — Get decrypted value

```bash
# Never print — pipe to file
curl -s "${ZIRALOOP_VERCEL_API_URL}/v1/projects/my-app/env/ENV_ID" \
  | jq -r '.value' > /tmp/.secret
```

### PATCH /v9/projects/{idOrName}/env/{id} — Edit env var

```bash
curl -s -X PATCH "${ZIRALOOP_VERCEL_API_URL}/v9/projects/my-app/env/ENV_ID" \
  -H "Content-Type: application/json" \
  -d '{"value": "new-value", "type": "encrypted", "target": ["production", "preview"]}' \
  | jq '{id, key}'
```

---

### GET /v5/domains — List domains

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v5/domains" \
  | jq '.domains[] | {name, verified, serviceType}'
```

### POST /v7/domains — Add domain to Vercel

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v7/domains" \
  -H "Content-Type: application/json" \
  -d '{"name": "example.com"}' \
  | jq '{name, verified}'
```

### GET /v6/domains/{domain}/config — Check DNS config

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v6/domains/example.com/config" \
  | jq '{configuredBy, misconfigured, cnames, aValues}'
```

### POST /v10/projects/{idOrName}/domains — Add domain to project

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v10/projects/my-app/domains" \
  -H "Content-Type: application/json" \
  -d '{"name": "app.example.com"}' \
  | jq '{name, verified, verification}'
```

### POST /v9/projects/{idOrName}/domains/{domain}/verify — Verify domain

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v9/projects/my-app/domains/app.example.com/verify" \
  | jq '{name, verified}'
```

---

### GET /v5/domains/{domain}/records — List DNS records

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v5/domains/example.com/records" \
  | jq '.records[] | {id, type, name, value, ttl}'
```

### POST /v2/domains/{domain}/records — Create DNS record

A record:
```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v2/domains/example.com/records" \
  -H "Content-Type: application/json" \
  -d '{"type": "A", "name": "", "value": "76.76.21.21", "ttl": 60}' \
  | jq '{uid, name, type, value}'
```

CNAME:
```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v2/domains/example.com/records" \
  -H "Content-Type: application/json" \
  -d '{"type": "CNAME", "name": "www", "value": "cname.vercel-dns.com", "ttl": 60}' \
  | jq '{uid, name, type, value}'
```

TXT:
```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v2/domains/example.com/records" \
  -H "Content-Type: application/json" \
  -d '{"type": "TXT", "name": "_verify", "value": "verification-token", "ttl": 60}' \
  | jq '{uid, name, type, value}'
```

MX: add `"mxPriority": 10`

SRV: use `"srv": {"priority": 10, "weight": 5, "port": 8080, "target": "srv.example.com"}`

TTL range: 60–2147483647 seconds.

---

### POST /v2/deployments/{id}/aliases — Assign alias

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v2/deployments/DEPLOY_ID/aliases" \
  -H "Content-Type: application/json" \
  -d '{"alias": "app.example.com"}' \
  | jq '{uid, alias}'
```

### GET /v4/aliases — List aliases

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v4/aliases" \
  | jq '.aliases[] | {uid, alias, deploymentId}'
```

---

### POST /v1/edge-config — Create edge config

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v1/edge-config" \
  -H "Content-Type: application/json" \
  -d '{"slug": "my_config", "items": {"feature_x": true, "max_retries": 3}}' \
  | jq '{id, slug, itemCount}'
```

### GET /v1/edge-config/{id}/items — Get all items

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v1/edge-config/EC_ID/items" | jq '.'
```

### PATCH /v1/edge-config/{id}/items — Batch update items

```bash
curl -s -X PATCH "${ZIRALOOP_VERCEL_API_URL}/v1/edge-config/EC_ID/items" \
  -H "Content-Type: application/json" \
  -d '{"items": [{"operation": "upsert", "key": "feature_x", "value": false}, {"operation": "delete", "key": "old_flag"}]}' \
  | jq '{status}'
```

Operations: `create`, `update`, `upsert`, `delete`

---

### GET /v2/teams — List teams

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v2/teams" \
  | jq '.teams[] | {id, name, slug}'
```

### GET /v3/teams/{teamId}/members — List team members

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v3/teams/TEAM_ID/members" \
  | jq '.members[] | {uid, email, role}'
```

---

### POST /v1/edge-cache/purge-all — Purge CDN cache

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v1/edge-cache/purge-all?teamId=TEAM_ID" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "PROJECT_ID"}' \
  | jq '.'
```

### POST /v1/edge-cache/invalidate-by-tags — Invalidate by cache tag

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v1/edge-cache/invalidate-by-tags" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "PROJECT_ID", "tags": ["blog", "homepage"]}' \
  | jq '.'
```

---

### PUT /v1/security/firewall/config — Set firewall rules

```bash
curl -s -X PUT "${ZIRALOOP_VERCEL_API_URL}/v1/security/firewall/config?projectId=PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"rules": [{"name": "block-bad-ips", "type": "ip_address", "action": "deny", "values": [{"value": "1.2.3.4"}]}]}' \
  | jq '.'
```

### GET /v1/security/firewall/config/active — Read firewall config

```bash
curl -s "${ZIRALOOP_VERCEL_API_URL}/v1/security/firewall/config/active?projectId=PROJECT_ID" \
  | jq '.rules[] | {name, action, type}'
```

---

### POST /v1/webhooks — Create webhook

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v1/webhooks" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://hooks.example.com/vercel", "events": ["deployment.succeeded", "deployment.error"]}' \
  | jq '{id, events, url, secret: "****"}'
```

Events: `deployment.created`, `deployment.succeeded`, `deployment.error`, `deployment.canceled`, `deployment.ready`, `deployment.promoted`, `deployment.rollback`, `project.created`, `project.removed`, `project.env-variable.created`, `project.domain.created`, `domain.created`, `alerts.triggered`, `budget.reached`

---

### PATCH /v1/projects/{idOrName}/rolling-release/config — Configure rolling releases

```bash
curl -s -X PATCH "${ZIRALOOP_VERCEL_API_URL}/v1/projects/my-app/rolling-release/config" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "advancementType": "manual-approval", "stages": [{"targetPercentage": 10}, {"targetPercentage": 50}, {"targetPercentage": 100}]}' \
  | jq '.'
```

### POST /v1/projects/{idOrName}/rolling-release/approve-stage — Advance stage

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v1/projects/my-app/rolling-release/approve-stage" \
  | jq '{status}'
```

### POST /v1/projects/{idOrName}/rolling-release/complete — Force complete

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v1/projects/my-app/rolling-release/complete" \
  | jq '{status}'
```

---

### PATCH /v1/projects/{idOrName}/protection-bypass — Manage protection bypass

```bash
curl -s -X PATCH "${ZIRALOOP_VERCEL_API_URL}/v1/projects/my-app/protection-bypass" \
  -H "Content-Type: application/json" \
  -d '{"bypass_token_value": {"scope": "automation"}}' \
  | jq '.'
```

### POST /v1/projects/{id}/crons/run — Trigger cron job

```bash
curl -s -X POST "${ZIRALOOP_VERCEL_API_URL}/v1/projects/PROJECT_ID/crons/run" \
  -H "Content-Type: application/json" \
  -d '{"cronPath": "/api/cron/cleanup"}' \
  | jq '.'
```
