# Daytona OpenCode Agent Snapshot

Builds a Daytona snapshot with:

- a pre-initialized Nango project under `/home/daytona/nango-integrations`
- the `nango` CLI installed globally
- the `opencode-ai` CLI installed globally
- the vendored `nango-remote-function-builder` skill under `.agents/skills`

The image runs `nango init . --copy`, removes the scaffolded example integration files, replaces `index.ts` with an empty module, installs the project dependencies, and bakes in a local copy of the `nango-remote-function-builder` skill from the sibling `../skills` repo for now.

This image is intentionally kept around even though the active prototype runtime uses E2B, so switching back to Daytona later is easier once network access is available.

Daytona debugging should happen through the Daytona UI, so this image does not include SSH-specific setup.

Example snapshot build command:

```bash
daytona snapshot create nango-opencode-agent \
  --dockerfile "packages/daytona-opencode-agent/Dockerfile" \
  --context "packages/daytona-opencode-agent" \
  --cpu 2 \
  --memory 4 \
  --disk 8
```
