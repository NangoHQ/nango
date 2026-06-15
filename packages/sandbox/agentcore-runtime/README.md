# AgentCore sandbox runtime

Temporary Amazon Bedrock AgentCore Runtime image for the sandbox provider PoC.

Build from the repo root:

```bash
docker buildx build --platform linux/arm64 -f packages/sandbox/agentcore-runtime/Dockerfile -t nango-agentcore-sandbox:local .
```

The container exposes the AgentCore HTTP contract on port `8080`:

- `POST /invocations` handles sandbox adapter operations used by `AgentCoreSandboxProvider`.
- `GET /ping` returns `HealthyBusy` while async dryrun/deploy commands are running.

This is intentionally colocated with `packages/sandbox` for iteration and should move next to the canonical sandbox image definitions before production use.
