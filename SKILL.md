---
name: managing-railway-infrastructure
description: Use when deploying services, managing environments, reading logs, or configuring infrastructure on Railway - provides pre-authenticated GraphQL API patterns for projects, services, deployments, variables, domains, volumes, buckets, and templates via ${RAILWAY_API_URL} proxy
---

# Managing Railway Infrastructure

## Overview

Manage Railway cloud infrastructure through a pre-authenticated GraphQL API proxy. All requests go to `${RAILWAY_API_URL}` with no auth headers — the proxy handles authentication.

## When to Use

- Deploying or redeploying services on Railway
- Managing environment variables, domains, or volumes
- Reading build/deploy/runtime logs
- Creating projects, environments, or services
- Checking deployment status or resource metrics
- Provisioning databases, buckets, or templates

## Quick Reference

Every call is `curl -s -X POST ${RAILWAY_API_URL} -H "Content-Type: application/json" -d '{"query": "...", "variables": {...}}'`. Always pipe through `jq`.

### Queries

| Operation | Key Variables | Purpose |
|-----------|--------------|---------|
| `UserMeta` | none | Get current user name/email |
| `UserProjects` | none | List all workspaces and projects |
| `Projects` | `workspaceId?` | List projects in a workspace |
| `Project` | `id!` | Full project state (environments, services, deployments, domains, volumes) |
| `Environments` | `projectId!` | List environments with PR metadata |
| `Deployments` | `input{projectId,serviceId,environmentId}` | List deployments with status |
| `LatestDeployment` | `serviceId!, environmentId!` | Quick deployment status check |
| `VariablesForServiceDeployment` | `projectId!, environmentId!, serviceId!` | Read rendered env vars |
| `Domains` | `environmentId!, projectId!, serviceId!` | List service/custom domains |
| `CustomDomainAvailable` | `domain!` | Check domain availability |
| `Regions` | none | List deployment regions |
| `DeploymentLogs` | `deploymentId!, limit?` | Runtime application logs |
| `BuildLogs` | `deploymentId!, limit?` | Build-phase logs |
| `HttpLogs` | `deploymentId!, beforeLimit!` | HTTP access logs |
| `Metrics` | `serviceId, environmentId, startDate!, measurements!` | CPU/memory/network/disk metrics |
| `Templates` | `verified?, recommended?, first?` | Discover templates |
| `TemplateDetail` | `code!` | Inspect template config |
| `BucketS3Credentials` | `projectId!, environmentId!, bucketId!` | Get S3 credentials |
| `BucketInstanceDetails` | `bucketId!, environmentId!` | Bucket size/object count |
| `WorkflowStatus` | `workflowId!` | Poll async operation completion |

### Mutations

| Operation | Key Variables | Purpose |
|-----------|--------------|---------|
| `ProjectCreate` | `name?, workspaceId?` | Create project |
| `ProjectScheduleDelete` | `id!` | Soft-delete project |
| `ServiceCreate` | `projectId!, environmentId!, source?, variables?` | Create service from image/repo |
| `ServiceDelete` | `environmentId!, serviceId!` | Delete service |
| `ServiceInstanceUpdate` | `serviceId!, environmentId?, input!` | Configure service (replicas, health checks, commands, regions, cron) |
| `ServiceInstanceDeploy` | `environmentId!, serviceId!` | Trigger deploy |
| `DeploymentRedeploy` | `id!` | Rebuild and redeploy |
| `DeploymentRestart` | `id!` | Restart without rebuild |
| `DeploymentRemove` | `id!` | Stop/remove deployment |
| `VariableCollectionUpsert` | `projectId!, serviceId!, environmentId!, variables!, skipDeploys?` | Set env vars |
| `VariableDelete` | `projectId!, environmentId!, name!, serviceId?` | Delete env var |
| `EnvironmentCreate` | `projectId!, name!, sourceId?` | Create/clone environment |
| `EnvironmentDelete` | `id!` | Delete environment |
| `ServiceDomainCreate` | `environmentId!, serviceId!` | Generate *.railway.app domain |
| `CustomDomainCreate` | `input{domain,environmentId,projectId,serviceId}` | Attach custom domain |
| `VolumeCreate` | `projectId!, environmentId!, serviceId!, mountPath!` | Create persistent volume |
| `VolumeDelete` | `id!` | Delete volume |
| `VolumeAttach` | `environmentId!, volumeId!, serviceId!` | Attach volume to service |
| `VolumeDetach` | `environmentId!, volumeId!` | Detach volume |
| `TemplateDeploy` | `projectId!, environmentId!, templateId!, serializedConfig!` | Deploy template (Postgres, Redis, etc.) |
| `BucketCreate` | `input{projectId!, name?, environmentId?}` | Create S3-compatible storage |
| `BucketCredentialsReset` | `projectId!, environmentId!, bucketId!` | Rotate bucket credentials |
| `UpdateRegions` | `environmentId!, serviceId!, multiRegionConfig!` | Set multi-region config |

## Implementation

### Request pattern

```bash
curl -s -X POST ${RAILWAY_API_URL} \
  -H "Content-Type: application/json" \
  -d '{"query": "...", "variables": {...}}' \
  | jq 'if .errors then {error: .errors[0].message} else .data end'
```

No Authorization header. No auth tokens. The proxy handles it.

### Rule 1: Always filter with jq

Never let raw JSON into your context. Always pipe through `jq` to extract only what you need.

```bash
# BAD
curl -s -X POST ${RAILWAY_API_URL} -H "Content-Type: application/json" -d '...'

# GOOD
curl -s -X POST ${RAILWAY_API_URL} -H "Content-Type: application/json" -d '...' \
  | jq '.data.project.services.edges[].node | {id, name}'
```

Common jq patterns:
```bash
| jq '.data.project.services.edges[].node | {id, name}'
| jq '.data.deployments.edges[].node | {id, status}'
| jq '.data.project.environments.edges[].node | select(.name == "production") | .id'
| jq '[.data.deployments.edges[].node.status] | group_by(.) | map({status: .[0], count: length})'
| jq 'if .errors then {error: .errors[0].message} else .data end'
```

### Rule 2: Only request fields you need

Do NOT copy full queries verbatim if you only need a subset. GraphQL lets you pick exactly what you need.

```bash
# Only need service names? Don't request deployments, domains, volumes...
curl -s -X POST ${RAILWAY_API_URL} -H "Content-Type: application/json" \
  -d '{"query": "query { project(id: \"PROJECT_ID\") { services { edges { node { id name } } } } }"}' \
  | jq '.data.project.services.edges[].node'
```

### Rule 3: Never expose sensitive data

Your output is logged. Mask secrets, credentials, tokens, and connection strings.

**Environment variables** — always mask sensitive values:
```bash
curl -s -X POST ${RAILWAY_API_URL} -H "Content-Type: application/json" \
  -d '{"query": "query($p:String!,$e:String!,$s:String!){variablesForServiceDeployment(projectId:$p,environmentId:$e,serviceId:$s)}", "variables": {"p":"...","e":"...","s":"..."}}' \
  | jq '.data.variablesForServiceDeployment | to_entries | map({key: .key, value: (if (.key | test("SECRET|KEY|TOKEN|PASSWORD|URL|DSN|CREDENTIALS|PRIVATE|MONGO|POSTGRES|MYSQL|REDIS|AMQP"; "i")) then "****" else .value end)}) | from_entries'
```

**Bucket credentials** — only non-secret fields: `| jq '.data.bucketS3Credentials | {endpoint, bucketName, region}'`

**If you must use a secret**, pipe directly to file: `curl -s ... | jq -r '.data.bucketS3Credentials.secretAccessKey' > /tmp/.bucket_secret`

### ID discovery

Most operations need IDs. Start with discovery:

1. `UserProjects` — enumerate all workspaces/projects
2. `Project` (with just the fields you need) — get environment, service, deployment IDs
3. Use returned IDs for subsequent operations

### Workflows

**Deploy service from image:**
```bash
SERVICE_ID=$(curl -s -X POST ${RAILWAY_API_URL} -H "Content-Type: application/json" \
  -d '{"query": "mutation { serviceCreate(input: { name: \"my-api\", projectId: \"PROJ\", environmentId: \"ENV\", source: { image: \"node:20\" } }) { id } }"}' \
  | jq -r '.data.serviceCreate.id')

curl -s -X POST ${RAILWAY_API_URL} -H "Content-Type: application/json" \
  -d "{\"query\": \"mutation { serviceDomainCreate(input: { environmentId: \\\"ENV\\\", serviceId: \\\"$SERVICE_ID\\\" }) { domain } }\"}" \
  | jq -r '.data.serviceDomainCreate.domain'
```

**Check status, read logs on failure:**
```bash
curl -s -X POST ${RAILWAY_API_URL} -H "Content-Type: application/json" \
  -d '{"query": "query { serviceInstance(environmentId: \"ENV\", serviceId: \"SVC\") { latestDeployment { id status } } }"}' \
  | jq '.data.serviceInstance.latestDeployment'

# If FAILED/CRASHED — read build logs (messages only)
curl -s -X POST ${RAILWAY_API_URL} -H "Content-Type: application/json" \
  -d '{"query": "query { buildLogs(deploymentId: \"DEPLOY\", limit: 200) { timestamp message } }"}' \
  | jq -r '.data.buildLogs[] | "\(.timestamp) \(.message)"'
```

**Batch env vars then deploy once:**
```bash
curl -s -X POST ${RAILWAY_API_URL} -H "Content-Type: application/json" \
  -d '{"query": "mutation($v: EnvironmentVariables!) { variableCollectionUpsert(input: { projectId: \"PROJ\", environmentId: \"ENV\", serviceId: \"SVC\", variables: $v, skipDeploys: true }) }", "variables": {"v": {"DB_URL": "...", "REDIS_URL": "..."}}}' \
  | jq '.data'

curl -s -X POST ${RAILWAY_API_URL} -H "Content-Type: application/json" \
  -d '{"query": "mutation { serviceInstanceDeployV2(environmentId: \"ENV\", serviceId: \"SVC\") }"}' \
  | jq '.data'
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Dumping raw curl output into context | Always pipe through `jq` to extract needed fields |
| Copying full query when only needing 2 fields | Write a minimal query with just those fields |
| Printing env var values in output | Mask with jq `test("SECRET\|KEY\|TOKEN\|PASSWORD\|URL"; "i")` filter |
| Printing bucket secretAccessKey | Only extract `{endpoint, bucketName, region}` unless writing to file |
| Sending Authorization header | Proxy handles auth — no header needed |
| Triggering deploy after each variable change | Use `skipDeploys: true`, then one `ServiceInstanceDeploy` at end |
| Not checking for errors | Always check `.errors` before using `.data` |

## ServiceInstanceUpdate Fields

| Field | Type | Description |
|-------|------|-------------|
| `buildCommand` | String | Custom build command |
| `builder` | String | NIXPACKS or DOCKERFILE |
| `cronSchedule` | String | Cron expression |
| `dockerfilePath` | String | Path to Dockerfile |
| `healthcheckPath` | String | HTTP health check endpoint |
| `healthcheckTimeout` | Int | Health check timeout (seconds) |
| `numReplicas` | Int | Number of replicas |
| `region` | String | Deployment region |
| `restartPolicyType` | String | NEVER, ON_FAILURE, or ALWAYS |
| `restartPolicyMaxRetries` | Int | Max restart retries |
| `rootDirectory` | String | Root directory for builds |
| `startCommand` | String | Start command |
| `sleepApplication` | Boolean | Enable/disable sleep mode |
| `source` | Object | `{repo: "owner/repo"}` or `{image: "image:tag"}` |
| `preDeployCommand` | String | Pre-deploy command (e.g., migrations) |
| `multiRegionConfig` | JSON | Multi-region config |
| `watchPatterns` | [String] | File patterns triggering redeploy |

## Enums

**Deployment status:** `BUILDING`, `DEPLOYING`, `SUCCESS`, `FAILED`, `CRASHED`, `REMOVED`, `SLEEPING`, `QUEUED`, `INITIALIZING`, `WAITING`, `SKIPPED`, `NEEDS_APPROVAL`, `REMOVING`

**Metric measurements:** `CPU_USAGE`, `MEMORY_USAGE_GB`, `NETWORK_RX_GB`, `NETWORK_TX_GB`, `DISK_USAGE_GB`

---

## GraphQL Query Bodies

Only request the fields you need — trim these down for your task.

### UserMeta

```graphql
query UserMeta {
  me { name email }
}
```

### UserProjects

```graphql
query UserProjects {
  externalWorkspaces {
    id name teamId
    projects {
      id name createdAt updatedAt deletedAt
      environments { edges { node { id name canAccess serviceInstances { edges { node { serviceId } } } } } }
      services { edges { node { id name } } }
    }
  }
  me {
    workspaces {
      id name
      team { id }
      projects(first: 500) {
        edges {
          node {
            id name createdAt updatedAt deletedAt
            environments { edges { node { id name canAccess serviceInstances { edges { node { serviceId } } } } } }
            services { edges { node { id name } } }
          }
        }
      }
    }
  }
}
```

### Projects

```graphql
query Projects($workspaceId: String) {
  projects(workspaceId: $workspaceId) {
    edges {
      node {
        id name updatedAt
        workspace { id name }
        environments { edges { node { id name serviceInstances { edges { node { serviceId } } } } } }
        services { edges { node { id name } } }
      }
    }
  }
}
```

Variables: `{ "workspaceId": "optional-workspace-id" }`

### Project

Full project state in one call.

```graphql
query Project($id: String!) {
  project(id: $id) {
    id name deletedAt
    workspace { name }
    buckets { edges { node { id name } } }
    environments {
      edges {
        node {
          id name canAccess deletedAt unmergedChangesCount
          serviceInstances {
            edges {
              node {
                id serviceId serviceName environmentId
                latestDeployment { canRedeploy id meta status createdAt deploymentStopped }
                activeDeployments { id status createdAt meta }
                source { repo image }
                domains {
                  serviceDomains { id domain targetPort }
                  customDomains { id domain targetPort }
                }
                cronSchedule nextCronRunAt startCommand
              }
            }
          }
          volumeInstances {
            edges {
              node {
                serviceId mountPath environmentId currentSizeMB sizeMB
                volume { name id }
              }
            }
          }
        }
      }
    }
    services { edges { node { id name } } }
  }
}
```

Variables: `{ "id": "project-id" }`

### Environments

```graphql
query Environments($projectId: String!, $isEphemeral: Boolean, $first: Int, $after: String) {
  environments(projectId: $projectId, isEphemeral: $isEphemeral, first: $first, after: $after) {
    edges {
      node {
        id name isEphemeral createdAt updatedAt canAccess unmergedChangesCount
        sourceEnvironment { id name }
        meta { prNumber prTitle prRepo branch baseBranch }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
```

Variables: `{ "projectId": "project-id", "isEphemeral": false, "first": 50 }`

### Deployments

```graphql
query Deployments($input: DeploymentListInput!, $first: Int) {
  deployments(input: $input, first: $first) {
    edges { node { id createdAt status meta } }
  }
}
```

Variables: `{ "input": { "projectId": "...", "serviceId": "...", "environmentId": "..." }, "first": 10 }`

### LatestDeployment

```graphql
query LatestDeployment($serviceId: String!, $environmentId: String!) {
  serviceInstance(environmentId: $environmentId, serviceId: $serviceId) {
    latestDeployment { id status }
  }
}
```

Variables: `{ "serviceId": "...", "environmentId": "..." }`

### VariablesForServiceDeployment

```graphql
query VariablesForServiceDeployment($projectId: String!, $environmentId: String!, $serviceId: String!) {
  variablesForServiceDeployment(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
}
```

Variables: `{ "projectId": "...", "environmentId": "...", "serviceId": "..." }`

### Domains

```graphql
query Domains($environmentId: String!, $projectId: String!, $serviceId: String!) {
  domains(environmentId: $environmentId, projectId: $projectId, serviceId: $serviceId) {
    serviceDomains { id domain }
    customDomains { id domain }
  }
}
```

Variables: `{ "environmentId": "...", "projectId": "...", "serviceId": "..." }`

### CustomDomainAvailable

```graphql
query CustomDomainAvailable($domain: String!) {
  customDomainAvailable(domain: $domain) { available message }
}
```

Variables: `{ "domain": "app.example.com" }`

### Regions

```graphql
query Regions {
  regions { name country railwayMetal location }
}
```

### DeploymentLogs

```graphql
query DeploymentLogs($deploymentId: String!, $limit: Int, $filter: String, $startDate: DateTime, $endDate: DateTime) {
  deploymentLogs(deploymentId: $deploymentId, limit: $limit, filter: $filter, startDate: $startDate, endDate: $endDate) {
    timestamp message
    attributes { key value }
  }
}
```

Variables: `{ "deploymentId": "...", "limit": 100 }`

### BuildLogs

```graphql
query BuildLogs($deploymentId: String!, $limit: Int, $startDate: DateTime, $endDate: DateTime, $filter: String) {
  buildLogs(deploymentId: $deploymentId, limit: $limit, startDate: $startDate, endDate: $endDate, filter: $filter) {
    timestamp message
    attributes { key value }
  }
}
```

Variables: `{ "deploymentId": "...", "limit": 200 }`

### HttpLogs

```graphql
query HttpLogs($deploymentId: String!, $filter: String, $beforeLimit: Int!, $beforeDate: String, $anchorDate: String, $afterDate: String, $afterLimit: Int) {
  httpLogs(deploymentId: $deploymentId, filter: $filter, beforeLimit: $beforeLimit, beforeDate: $beforeDate, anchorDate: $anchorDate, afterDate: $afterDate, afterLimit: $afterLimit) {
    timestamp method path httpStatus totalDuration requestId host
    clientUa srcIp edgeRegion txBytes rxBytes
    upstreamRqDuration upstreamAddress upstreamProto downstreamProto
    upstreamErrors responseDetails deploymentId deploymentInstanceId
  }
}
```

Variables: `{ "deploymentId": "...", "beforeLimit": 50 }`

### Metrics

```graphql
query Metrics($serviceId: String, $environmentId: String, $startDate: DateTime!, $endDate: DateTime, $measurements: [MetricMeasurement!]!, $sampleRateSeconds: Int) {
  metrics(serviceId: $serviceId, environmentId: $environmentId, startDate: $startDate, endDate: $endDate, measurements: $measurements, sampleRateSeconds: $sampleRateSeconds) {
    measurement
    values { ts value }
  }
}
```

Variables: `{ "serviceId": "...", "environmentId": "...", "startDate": "2025-01-01T00:00:00Z", "measurements": ["CPU_USAGE", "MEMORY_USAGE_GB"], "sampleRateSeconds": 3600 }`

### Templates

```graphql
query Templates($verified: Boolean, $recommended: Boolean, $first: Int) {
  templates(verified: $verified, recommended: $recommended, first: $first) {
    edges { node { id code name } }
  }
}
```

Variables: `{ "recommended": true, "first": 20 }`

### TemplateDetail

```graphql
query TemplateDetail($code: String!) {
  template(code: $code) { id name serializedConfig }
}
```

Variables: `{ "code": "template-code" }`

### BucketS3Credentials

```graphql
query BucketS3Credentials($projectId: String!, $environmentId: String!, $bucketId: String!) {
  bucketS3Credentials(projectId: $projectId, environmentId: $environmentId, bucketId: $bucketId) {
    accessKeyId secretAccessKey endpoint bucketName region urlStyle
  }
}
```

Variables: `{ "projectId": "...", "environmentId": "...", "bucketId": "..." }`

### BucketInstanceDetails

```graphql
query BucketInstanceDetails($bucketId: String!, $environmentId: String!) {
  bucketInstanceDetails(bucketId: $bucketId, environmentId: $environmentId) { sizeBytes objectCount }
}
```

Variables: `{ "bucketId": "...", "environmentId": "..." }`

### WorkflowStatus

```graphql
query WorkflowStatus($workflowId: String!) {
  workflowStatus(workflowId: $workflowId) { status error }
}
```

Variables: `{ "workflowId": "..." }`

---

## GraphQL Mutation Bodies

### ProjectCreate

```graphql
mutation ProjectCreate($name: String, $description: String, $workspaceId: String) {
  projectCreate(input: { name: $name, description: $description, workspaceId: $workspaceId }) {
    name id
    environments { edges { node { id name } } }
  }
}
```

Variables: `{ "name": "my-project", "description": "optional", "workspaceId": "optional" }`

### ProjectScheduleDelete

```graphql
mutation ProjectScheduleDelete($id: String!) {
  projectScheduleDelete(id: $id)
}
```

Variables: `{ "id": "project-id" }`

### ServiceCreate

```graphql
mutation ServiceCreate($name: String, $projectId: String!, $environmentId: String!, $source: ServiceSourceInput, $branch: String, $variables: EnvironmentVariables) {
  serviceCreate(input: { name: $name, projectId: $projectId, environmentId: $environmentId, source: $source, variables: $variables, branch: $branch }) { id name }
}
```

From image: `{ "name": "api", "projectId": "...", "environmentId": "...", "source": { "image": "nginx:latest" }, "variables": { "PORT": "8080" } }`

From repo: `{ "name": "api", "projectId": "...", "environmentId": "...", "source": { "repo": "owner/repo" }, "branch": "main" }`

### ServiceDelete

```graphql
mutation ServiceDelete($environmentId: String!, $serviceId: String!) {
  serviceDelete(environmentId: $environmentId, id: $serviceId)
}
```

Variables: `{ "environmentId": "...", "serviceId": "..." }`

### ServiceInstanceUpdate

```graphql
mutation ServiceInstanceUpdate($serviceId: String!, $environmentId: String, $input: ServiceInstanceUpdateInput!) {
  serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
}
```

Scale: `{ "serviceId": "...", "environmentId": "...", "input": { "numReplicas": 3, "healthcheckPath": "/health" } }`

Cron: `{ "serviceId": "...", "environmentId": "...", "input": { "startCommand": "node server.js", "cronSchedule": "0 */6 * * *" } }`

### ServiceInstanceDeploy

```graphql
mutation ServiceInstanceDeploy($environmentId: String!, $serviceId: String!) {
  serviceInstanceDeployV2(environmentId: $environmentId, serviceId: $serviceId)
}
```

Variables: `{ "environmentId": "...", "serviceId": "..." }`

### DeploymentRedeploy

```graphql
mutation DeploymentRedeploy($id: String!) {
  deploymentRedeploy(id: $id) { id }
}
```

Variables: `{ "id": "deployment-id" }`

### DeploymentRestart

```graphql
mutation DeploymentRestart($id: String!) {
  deploymentRestart(id: $id)
}
```

Variables: `{ "id": "deployment-id" }`

### DeploymentRemove

```graphql
mutation DeploymentRemove($id: String!) {
  deploymentRemove(id: $id)
}
```

Variables: `{ "id": "deployment-id" }`

### VariableCollectionUpsert

```graphql
mutation VariableCollectionUpsert($projectId: String!, $serviceId: String!, $environmentId: String!, $variables: EnvironmentVariables!, $skipDeploys: Boolean) {
  variableCollectionUpsert(input: { projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId, variables: $variables, skipDeploys: $skipDeploys })
}
```

Variables: `{ "projectId": "...", "serviceId": "...", "environmentId": "...", "variables": { "DATABASE_URL": "postgres://...", "NODE_ENV": "production" }, "skipDeploys": true }`

### VariableDelete

```graphql
mutation VariableDelete($projectId: String!, $environmentId: String!, $name: String!, $serviceId: String) {
  variableDelete(input: { projectId: $projectId, environmentId: $environmentId, name: $name, serviceId: $serviceId })
}
```

Variables: `{ "projectId": "...", "environmentId": "...", "name": "OLD_API_KEY", "serviceId": "..." }`

### EnvironmentCreate

```graphql
mutation EnvironmentCreate($projectId: String!, $name: String!, $sourceId: String, $applyChangesInBackground: Boolean) {
  environmentCreate(input: { projectId: $projectId, name: $name, sourceEnvironmentId: $sourceId, applyChangesInBackground: $applyChangesInBackground }) { name id }
}
```

Clone: `{ "projectId": "...", "name": "staging", "sourceId": "production-env-id" }`

New: `{ "projectId": "...", "name": "staging" }`

### EnvironmentDelete

```graphql
mutation EnvironmentDelete($id: String!) {
  environmentDelete(id: $id)
}
```

Variables: `{ "id": "environment-id" }`

### ServiceDomainCreate

```graphql
mutation ServiceDomainCreate($environmentId: String!, $serviceId: String!) {
  serviceDomainCreate(input: { environmentId: $environmentId, serviceId: $serviceId }) { id domain }
}
```

Variables: `{ "environmentId": "...", "serviceId": "..." }`

### CustomDomainCreate

```graphql
mutation CustomDomainCreate($input: CustomDomainCreateInput!) {
  customDomainCreate(input: $input) {
    id domain serviceId environmentId projectId targetPort
    status {
      dnsRecords { hostlabel fqdn recordType requiredValue currentValue status zone purpose }
      certificateStatus verified
    }
  }
}
```

Variables: `{ "input": { "domain": "app.example.com", "environmentId": "...", "projectId": "...", "serviceId": "..." } }`

### VolumeCreate

```graphql
mutation VolumeCreate($projectId: String!, $environmentId: String!, $serviceId: String!, $mountPath: String!) {
  volumeCreate(input: { projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId, mountPath: $mountPath }) { id name }
}
```

Variables: `{ "projectId": "...", "environmentId": "...", "serviceId": "...", "mountPath": "/data" }`

### VolumeDelete

```graphql
mutation VolumeDelete($id: String!) {
  volumeDelete(volumeId: $id)
}
```

Variables: `{ "id": "volume-id" }`

### VolumeAttach

```graphql
mutation VolumeAttach($environmentId: String!, $volumeId: String!, $serviceId: String!) {
  volumeInstanceUpdate(input: { serviceId: $serviceId }, environmentId: $environmentId, volumeId: $volumeId)
}
```

Variables: `{ "environmentId": "...", "volumeId": "...", "serviceId": "..." }`

### VolumeDetach

```graphql
mutation VolumeDetach($environmentId: String!, $volumeId: String!) {
  volumeInstanceUpdate(input: { serviceId: null }, environmentId: $environmentId, volumeId: $volumeId)
}
```

Variables: `{ "environmentId": "...", "volumeId": "..." }`

### VolumeMountPathUpdate

```graphql
mutation VolumeMountPathUpdate($serviceId: String, $environmentId: String!, $volumeId: String!, $mountPath: String!) {
  volumeInstanceUpdate(input: { serviceId: $serviceId, mountPath: $mountPath }, environmentId: $environmentId, volumeId: $volumeId)
}
```

Variables: `{ "serviceId": "...", "environmentId": "...", "volumeId": "...", "mountPath": "/new/path" }`

### VolumeNameUpdate

```graphql
mutation VolumeNameUpdate($volumeId: String!, $name: String!) {
  volumeUpdate(volumeId: $volumeId, input: { name: $name }) { name }
}
```

Variables: `{ "volumeId": "...", "name": "new-name" }`

### UpdateRegions

```graphql
mutation UpdateRegions($environmentId: String!, $serviceId: String!, $multiRegionConfig: JSON!) {
  serviceInstanceUpdate(environmentId: $environmentId, serviceId: $serviceId, input: { multiRegionConfig: $multiRegionConfig })
}
```

Variables: `{ "environmentId": "...", "serviceId": "...", "multiRegionConfig": { "us-west1": {}, "eu-west1": {} } }`

### TemplateDeploy

```graphql
mutation TemplateDeploy($projectId: String!, $environmentId: String!, $templateId: String!, $serializedConfig: SerializedTemplateConfig!) {
  templateDeployV2(input: { projectId: $projectId, environmentId: $environmentId, templateId: $templateId, serializedConfig: $serializedConfig }) { projectId workflowId }
}
```

Variables: `{ "projectId": "...", "environmentId": "...", "templateId": "...", "serializedConfig": {} }`

Poll `WorkflowStatus` with the returned `workflowId` until complete.

### BucketCreate

```graphql
mutation BucketCreate($input: BucketCreateInput!) {
  bucketCreate(input: $input) { id name projectId }
}
```

Variables: `{ "input": { "projectId": "...", "name": "my-bucket", "environmentId": "..." } }`

### BucketUpdate

```graphql
mutation BucketUpdate($id: String!, $input: BucketUpdateInput!) {
  bucketUpdate(id: $id, input: $input) { id name projectId }
}
```

Variables: `{ "id": "bucket-id", "input": { "name": "new-name" } }`

### BucketCredentialsReset

Rotates credentials. Do NOT print secretAccessKey — confirm success only.

```graphql
mutation BucketCredentialsReset($projectId: String!, $environmentId: String!, $bucketId: String!) {
  bucketCredentialsReset(projectId: $projectId, environmentId: $environmentId, bucketId: $bucketId) {
    accessKeyId secretAccessKey endpoint bucketName region urlStyle
  }
}
```

Variables: `{ "projectId": "...", "environmentId": "...", "bucketId": "..." }`

Safe jq: `| jq '{success: (.data.bucketCredentialsReset.accessKeyId != null), endpoint: .data.bucketCredentialsReset.endpoint}'`
