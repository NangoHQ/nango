## SF Public API Endpoints
### Auth (both endpoints)
- Header: `Authorization: Bearer <NANGO_SECRET_KEY>`
- Header: `Content-Type: application/json`
- No query params allowed.
- `environment` must exactly match the environment tied to the secret key.
---

Base URL: `https://api-development.nango.dev`

Always call these endpoints against that host. This is an internal API and is not documented anywhere else but in this skill.

### POST `https://api-development.nango.dev/sf-deploy`
Compile TypeScript + deploy latest version.
#### Request body (strict)
```json
{
  "integration_id": "string",   // regex: ^[a-zA-Z0-9~:.@ _-]+$, max 255
  "function_name": "string",    // regex: ^[a-zA-Z0-9_-]+$, max 255
  "function_type": "action | sync",
  "code": "string",             // TypeScript source
  "environment": "string"
}
Success 200
{
  "integration_id": "string",
  "function_name": "string",
  "function_type": "action | sync",
  "deployment": {
    "name": "string",
    "version": "string?",
    "providerConfigKey": "string",
    "type": "action | sync | on-event",
    "last_deployed": "date?",
    "input": "string | null?",
    "models": "string | string[]",
    "id": "number?",
    "runs": "string | null?"
  }
}
Error shape
{
  "error": {
    "step": "compilation | deployment",
    "message": "string",
    "code": "string?",
    "payload": "object?",
    "additional_properties": "object?",
    "stack": "string?"
  }
}
---
POST https://api-development.nango.dev/sf-run
Run latest deployed version in dry-run mode.
Request body (strict)
{
  "integration_id": "string",   // regex: ^[a-zA-Z0-9~:.@ _-]+$, max 255
  "function_name": "string",    // regex: ^[a-zA-Z0-9_-]+$, max 255
  "function_type": "action | sync",
  "connection_id": "string",    // regex: ^[a-zA-Z0-9,.;:=+~[\\]|@${}\"'\\/_ -]+$, max 255
  "environment": "string",
  "test_input": "any?",         // used for action
  "metadata": "object?",        // used for sync
  "checkpoint": "object?",      // sync checkpoint; values string|number|boolean
  "last_sync_date": "ISO datetime string?" // used for sync
}
Success 200 (action)
{
  "integration_id": "string",
  "function_name": "string",
  "function_type": "action",
  "output": "any",
  "proxy_calls": [
    {
      "method": "string",
      "endpoint": "string",
      "status": "number",
      "request": {
        "params": "object?",
        "headers": "object?",
        "data": "any?"
      },
      "response": "any",
      "headers": "object<string,string>"
    }
  ]
}
Success 200 (sync)
{
  "integration_id": "string",
  "function_name": "string",
  "function_type": "sync",
  "changes": {
    "counts": {
      "added": "number",
      "updated": "number",
      "deleted": "number"
    },
    "batchSave": "object<string, any[]>",
    "batchUpdate": "object<string, any[]>",
    "batchDelete": "object<string, any[]>",
    "logs": "any[]"
  },
  "proxy_calls": [
    {
      "method": "string",
      "endpoint": "string",
      "status": "number",
      "request": {
        "params": "object?",
        "headers": "object?",
        "data": "any?"
      },
      "response": "any",
      "headers": "object<string,string>"
    }
  ]
}
Error shape
{
  "error": {
    "step": "lookup | execution",
    "message": "string",
    "code": "string?",
    "payload": "object?",
    "additional_properties": "object?",
    "stack": "string?"
  }
}
