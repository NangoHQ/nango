# Daytona SF Compiler Snapshot

Builds a Daytona snapshot with a pre-initialized Nango project under `/home/daytona/nango-integrations` and the `nango` CLI installed globally.

Because `daytonaio/sandbox:0.6.0` already includes `opencode-ai`, this image explicitly removes it so the compiler snapshot stays OpenCode-free.

The image runs `nango init . --copy`, removes the scaffolded example integration files, replaces `index.ts` with an empty module, and installs the project dependencies.

This image is intentionally kept around even though the active prototype runtime uses E2B, so switching back to Daytona later is easier once network access is available.

Daytona debugging should happen through the Daytona UI, so this image does not include SSH-specific setup.

Example snapshot build command:

```bash
daytona snapshot create nango-sf-compiler \
  --dockerfile "packages/daytona-sf-compiler/Dockerfile" \
  --context "packages/daytona-sf-compiler" \
  --cpu 1 \
  --memory 2 \
  --disk 4
```
